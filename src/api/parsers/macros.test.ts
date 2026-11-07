import { describe, expect, test, vi } from "vitest";
import { MacrosType } from "@Renderer/types/macros";
import SonseiWireless from "../hardware-virtual/SonseiWireless";
import {
  decodeMacroOptions,
  encodeMacroOptions,
  hasMacroUpgradeMarker,
  macroHighestStep,
  macroNeedsUpgrade,
  macroStepLimit,
  macrosByteLength,
  parseMacrosRaw,
  rawMacrosHighestStep,
  rawMacrosNeedUpgrade,
  readMacroStepLimit,
  serializeMacros,
} from "./macros";

// Let a test switch the Bazecor language that KeymapDB reads
const settings = vi.hoisted(() => ({ language: "en-US" }));

vi.mock("../../renderer/utils/Store", () => ({
  default: {
    getStore: () => ({ get: (key: string) => (key === "settings.language" ? settings.language : undefined), set: () => {} }),
  },
}));

const parse = (raw: string) => parseMacrosRaw(raw);

const roundTrip = (raw: string) => serializeMacros(parse(raw), 2048);

const macro = (actions: MacrosType["actions"], options?: MacrosType["options"]): MacrosType => ({
  actions,
  name: "",
  macro: "",
  ...(options ? { options } : {}),
});

describe("parseMacrosRaw and serializeMacros", () => {
  test("the virtual Sonsei map parses to 2 macros and round-trips byte-identical", () => {
    const raw = SonseiWireless.virtual["macros.map"].data;

    const macros = parse(raw);

    expect(macros).toHaveLength(2);
    expect(serializeMacros(macros, 2048)).toBe(raw);
  });

  test("a WAIT of 256 at a macro end keeps the next macro", () => {
    const macros = parse("2 1 0 0 8 4 0 0");

    expect(macros.map(m => m.actions)).toEqual([[{ type: 2, keyCode: 256 }], [{ type: 8, keyCode: 4 }]]);
  });

  test("a WAIT of 0 is a step, not the map end", () => {
    const macros = parse("2 0 0 0 0");

    expect(macros.map(m => m.actions)).toEqual([[{ type: 2, keyCode: 0 }]]);
  });

  test("a random delay reads as [min, max] and round-trips", () => {
    const raw = "1 0 100 1 244 0 0";

    expect(parse(raw)[0].actions).toEqual([{ type: 1, keyCode: [100, 500] }]);
    expect(roundTrip(raw)).toBe(raw);
  });

  test("an option step gives the options and round-trips", () => {
    const raw = "14 140 8 4 0 0";

    const [parsed] = parse(raw);

    expect(parsed.options).toEqual({ mode: 0, ignoreMods: true, otherKeysStop: true });
    expect(parsed.actions).toEqual([{ type: 8, keyCode: 4 }]);
    expect(roundTrip(raw)).toBe(raw);
  });

  test("classic options are omitted, and a misplaced option step is ignored and dropped", () => {
    // 128 is the classic option byte
    expect(parse("14 128 8 4 0 0")[0].options).toBeUndefined();
    expect(roundTrip("14 128 8 4 0 0")).toBe("8 4 0 0");

    const [misplaced] = parse("8 4 14 140 0 0");

    expect(misplaced).toEqual({ actions: [{ type: 8, keyCode: 4 }], id: 0, name: "", macro: "" });
    expect(roundTrip("8 4 14 140 0 0")).toBe("8 4 0 0");
  });

  test.each([
    ["mode 3 alone", "14 131 8 4 0 0", undefined],
    ["mode 3 with both flags", "14 143 8 4 0 0", { mode: 0, ignoreMods: true, otherKeysStop: true }],
    ["a byte without bit 7", "14 14 8 4 0 0", undefined],
  ])("%s reads as the defaults", (_, raw, options) => {
    expect(parse(raw)[0].options).toEqual(options);
  });

  test.each([["15 0 0"], ["15 8 27 0 0"]])("the release marker in %s round-trips", raw => {
    expect(parse(raw)[0].actions[0]).toEqual({ type: 15, keyCode: 0 });
    expect(roundTrip(raw)).toBe(raw);
  });

  test("the layer off marker has no payload and round-trips", () => {
    const raw = "14 140 6 227 8 43 17 7 227 0 0";

    const [parsed] = parse(raw);

    expect(parsed.actions).toEqual([
      { type: 6, keyCode: 227 },
      { type: 8, keyCode: 43 },
      { type: 17, keyCode: 0 },
      { type: 7, keyCode: 227 },
    ]);
    expect(roundTrip(raw)).toBe(raw);
  });

  test("the stored names label shows the layer off marker as Layer off", () => {
    const stored: MacrosType[] = [{ actions: [], name: "Switcher", macro: "" }];

    const [parsed] = parseMacrosRaw("17 0 0", stored);

    expect(parsed.macro).toBe("Layer off");
  });

  test.each([
    ["é", "16 195 169 0 0", 0xe9],
    ["😀", "16 240 159 152 128 0 0", 0x1f600],
  ])("the Unicode step %s gives its code point and serializes back", (_, raw, cp) => {
    expect(parse(raw)[0].actions).toEqual([{ type: 16, keyCode: cp }]);
    expect(roundTrip(raw)).toBe(raw);
  });

  test.each([
    ["an overlong lead keeps the tap after it", "16 192 128 8 4 0 0", [[{ type: 8, keyCode: 4 }]]],
    ["a surrogate is dropped", "16 237 160 128 8 4 0 0", [[{ type: 8, keyCode: 4 }]]],
    ["a step without payload ends at the END that follows", "16 0 0", [[]]],
    ["a code point above U+10FFFF is dropped", "16 244 144 128 128 0 0", [[]]],
  ])("invalid UTF-8: %s", (_, raw, actions) => {
    expect(parse(raw).map(m => m.actions)).toEqual(actions);
  });

  test("an empty macro between two others is written as an implicit report and parses back", () => {
    const macros = [macro([{ type: 8, keyCode: 4 }]), macro([]), macro([{ type: 8, keyCode: 5 }])];

    const raw = serializeMacros(macros, 2048);

    expect(raw).toBe("8 4 0 10 0 8 5 0 0");
    expect(parse(raw).map(m => m.actions)).toEqual([[{ type: 8, keyCode: 4 }], [], [{ type: 8, keyCode: 5 }]]);
  });

  test("report steps take 1 byte and tap sequences round-trip", () => {
    const raw = "9 8 4 11 10 12 0 4 2 5 0 0 13 4 5 6 0 0 0";

    const [parsed] = parse(raw);

    expect(parsed.actions).toEqual([
      { type: 9, keyCode: 0 },
      { type: 8, keyCode: 4 },
      { type: 11, keyCode: 0 },
      { type: 10, keyCode: 0 },
      // Shift+B is flags 2, code 5
      { type: 12, keyCode: [4, 517] },
      { type: 13, keyCode: [4, 5, 6] },
    ]);
    expect(roundTrip(raw)).toBe(raw);
  });

  test("erased memory gives one empty macro", () => {
    const macros = parse(Array(2048).fill("255").join(" "));

    expect(macros).toEqual([{ actions: [], id: 0, name: "", macro: "" }]);
  });

  test("bytes after END END are ignored", () => {
    expect(parse("8 4 0 0 8 5 0 0").map(m => m.actions)).toEqual([[{ type: 8, keyCode: 4 }]]);
  });

  test("an unknown step between two ENDs gives an empty macro, as the firmware cache counts it", () => {
    expect(parse("8 4 0 255 0 8 5 0 0").map(m => m.actions)).toEqual([[{ type: 8, keyCode: 4 }], [], [{ type: 8, keyCode: 5 }]]);
  });

  test("a Unicode step reads at most its lead's length, so a surplus continuation byte is skipped alone", () => {
    expect(parse("16 195 169 169 8 4 0 0")[0].actions).toEqual([
      { type: 16, keyCode: 0xe9 },
      { type: 8, keyCode: 4 },
    ]);
  });

  test("a macro with options and no actions round-trips without an implicit report", () => {
    const raw = "14 140 0 8 4 0 0";

    const macros = parse(raw);

    expect(macros).toHaveLength(2);
    expect(macros[0]).toEqual({
      actions: [],
      id: 0,
      name: "",
      macro: "",
      options: { mode: 0, ignoreMods: true, otherKeysStop: true },
    });
    expect(roundTrip(raw)).toBe(raw);
  });

  test.each([
    ["a tail with a valid action is kept as the last macro", "8 4 0 8 5", [[{ type: 8, keyCode: 4 }], [{ type: 8, keyCode: 5 }]]],
    ["a clipped last step is dropped from the tail", "8 4 0 8 5 2 1", [[{ type: 8, keyCode: 4 }], [{ type: 8, keyCode: 5 }]]],
    ["a tail of erased memory gives no macro", "8 4 0 255 255", [[{ type: 8, keyCode: 4 }]]],
  ])("steps after the last END without END END: %s", (_, raw, actions) => {
    expect(parse(raw).map(m => m.actions)).toEqual(actions);
  });

  test("a kept tail is saved with its END", () => {
    expect(roundTrip("8 4 0 8 5")).toBe("8 4 0 8 5 0 0");
  });

  test("labels follow the language selected when the macros are parsed", () => {
    const stored: MacrosType[] = [{ actions: [], name: "Named", macro: "" }];
    // Key code 28 is Y in English and Z in German
    const raw = "8 28 0 0";

    settings.language = "en-US";
    const english = parseMacrosRaw(raw, stored)[0].macro;
    settings.language = "de-DE";
    const german = parseMacrosRaw(raw, stored)[0].macro;
    settings.language = "en-US";

    expect([english, german]).toEqual(["Y", "Z"]);
  });

  test("macrosByteLength equals the serialized length, and no macros take no bytes", () => {
    const macros = [
      macro([{ type: 8, keyCode: 4 }], { mode: 1, ignoreMods: true, otherKeysStop: false }),
      macro([]),
      macro([
        { type: 15, keyCode: 0 },
        { type: 16, keyCode: 0x1f600 },
      ]),
    ];

    expect(macrosByteLength(macros)).toBe(serializeMacros(macros, 2048).split(" ").length);
    expect(macrosByteLength([])).toBe(0);
  });

  test("an empty list serializes to the eraser", () => {
    expect(serializeMacros([], 4)).toBe("255 255 255 255");
  });
});

describe("macro upgrade detection", () => {
  const legacy = macro([
    { type: 8, keyCode: 4 },
    { type: 2, keyCode: 100 },
  ]);

  test("legacy macros need no upgrade", () => {
    expect(macroNeedsUpgrade(legacy)).toBe(false);
    expect(rawMacrosNeedUpgrade("8 4 2 0 100 0 0")).toBe(false);
  });

  test.each([
    ["options", macro([{ type: 8, keyCode: 4 }], { mode: 0, ignoreMods: true, otherKeysStop: true })],
    ["the marker", macro([{ type: 15, keyCode: 0 }])],
    ["Unicode", macro([{ type: 16, keyCode: 0xe9 }])],
  ])("a macro with %s needs the upgrade", (_, m) => {
    expect(macroNeedsUpgrade(m)).toBe(true);
  });

  test.each([
    ["options", "14 140 8 4 0 0"],
    ["the marker", "8 4 0 15 0 0"],
    ["Unicode", "16 195 169 0 0"],
    ["a stray classic option step", "14 128 8 4 0 0"],
  ])("a map with %s needs the upgrade", (_, raw) => {
    expect(rawMacrosNeedUpgrade(raw)).toBe(true);
  });

  test("a payload byte of 14 is no option step", () => {
    // Tap of keycode 14 (K)
    expect(rawMacrosNeedUpgrade("8 14 0 0")).toBe(false);
  });

  test("a macro whose only new step is the layer off marker needs the upgrade", () => {
    expect(macroNeedsUpgrade(macro([{ type: 17, keyCode: 0 }]))).toBe(true);
    expect(rawMacrosNeedUpgrade("8 4 17 0 0")).toBe(true);
  });

  test.each([
    ["the layer off marker", macro([{ type: 15, keyCode: 0 }, { type: 17, keyCode: 0 }]), 17],
    ["Unicode", macro([{ type: 16, keyCode: 0xe9 }], { mode: 0, ignoreMods: true, otherKeysStop: true }), 16],
    ["only classic steps", macro([{ type: 13, keyCode: [4, 5] }]), 13],
    ["no steps, written as an implicit report", macro([]), 10],
  ])("macroHighestStep with %s", (_, m, highest) => {
    expect(macroHighestStep(m)).toBe(highest);
  });

  test.each([
    ["the layer off marker", "8 4 0 17 0 0", 17],
    ["the release marker and Unicode", "15 16 195 169 0 0", 16],
    ["only a tap", "8 4 0 0", 8],
    ["erased memory between two ENDs", "8 4 0 255 0 0", 8],
    ["no macros", "", 0],
  ])("rawMacrosHighestStep with %s", (_, raw, highest) => {
    expect(rawMacrosHighestStep(raw)).toBe(highest);
  });

  test("hasMacroUpgradeMarker reads help lines and rejects non-strings", () => {
    expect(hasMacroUpgradeMarker("macros.map\r\nmacros.state\r\nmacros.memory")).toBe(true);
    expect(hasMacroUpgradeMarker("macros.map\nmacros.memory")).toBe(false);
    expect(hasMacroUpgradeMarker(new Error("timeout"))).toBe(false);
    expect(hasMacroUpgradeMarker(undefined)).toBe(false);
  });

  test("the option byte table round-trips", () => {
    const table: [number, MacrosType["options"]][] = [
      [0x80, undefined],
      [0x84, { mode: 0, ignoreMods: true, otherKeysStop: false }],
      [0x88, { mode: 0, ignoreMods: false, otherKeysStop: true }],
      [0x8c, { mode: 0, ignoreMods: true, otherKeysStop: true }],
      [0x81, { mode: 1, ignoreMods: false, otherKeysStop: false }],
      [0x86, { mode: 2, ignoreMods: true, otherKeysStop: false }],
      [0x8a, { mode: 2, ignoreMods: false, otherKeysStop: true }],
    ];

    table.forEach(([byte, options]) => {
      expect(decodeMacroOptions(byte)).toEqual(options);
      expect(encodeMacroOptions(options)).toBe(byte);
    });
  });
});

describe("macro step limit", () => {
  const stepsDevice = (reply: () => Promise<unknown>) => {
    const noCacheCommand = vi.fn(reply);
    return { device: { noCacheCommand }, noCacheCommand };
  };

  test("help without macros.state gives 13 and reads nothing", async () => {
    const { device, noCacheCommand } = stepsDevice(async () => "17");

    const limit = await readMacroStepLimit(device, "macros.map\r\nmacros.memory");

    expect(limit).toBe(13);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("help with macros.state only gives 16 and does not read macros.steps", async () => {
    const { device, noCacheCommand } = stepsDevice(async () => "17");

    const limit = await readMacroStepLimit(device, "macros.map\r\nmacros.state");

    expect(limit).toBe(16);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("help with macros.steps gives its reply", async () => {
    const { device, noCacheCommand } = stepsDevice(async () => "17");

    const limit = await readMacroStepLimit(device, "macros.map\r\nmacros.state\r\nmacros.steps");

    expect(limit).toBe(17);
    expect(noCacheCommand.mock.calls).toEqual([["macros.steps"]]);
  });

  test.each([
    ["garbage", async (): Promise<unknown> => "abc"],
    ["a value below 17", async (): Promise<unknown> => "15"],
    ["a value above 255", async (): Promise<unknown> => "300"],
    ["a fraction", async (): Promise<unknown> => "17.5"],
    ["an Error", async (): Promise<unknown> => new Error("timeout")],
    [
      "a throw",
      async (): Promise<unknown> => {
        throw new Error("port closed");
      },
    ],
  ])("a macros.steps reply that is %s gives 16", async (_, reply) => {
    const { device } = stepsDevice(reply);

    expect(await readMacroStepLimit(device, "macros.state\r\nmacros.steps")).toBe(16);
  });

  test.each([
    ["no upgrade ignores the stored value", 17, false, 13],
    ["no upgrade without a stored value", undefined, false, 13],
    ["upgrade without a stored value", undefined, true, 16],
    ["upgrade with a stored 16", 16, true, 16],
    ["upgrade with a stored 17", 17, true, 17],
    ["upgrade with a stored 13", 13, true, 16],
    ["upgrade with a stored string", "17", true, 16],
    ["upgrade with a stored fraction", 17.5, true, 16],
  ])("macroStepLimit: %s", (_, stored, upgrade, limit) => {
    expect(macroStepLimit(stored, upgrade)).toBe(limit);
  });

  test("the virtual Sonsei lists macros.steps and replies 17", async () => {
    const { virtual } = SonseiWireless;
    const device = { noCacheCommand: async (cmd: string) => virtual[cmd]?.data };

    expect(await readMacroStepLimit(device, virtual.help.data)).toBe(17);
    expect(virtual["macros.steps"]).toEqual({ data: "17", eraseable: false });
  });
});
