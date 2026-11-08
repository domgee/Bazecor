import { describe, expect, test, vi } from "vitest";
import {
  HOLD_MODS_COMMAND,
  HOLD_MODS_NORMALIZED,
  HOLD_MODS_NOT_RESTORED,
  MAX_HOLD_MODS,
  hasHoldModsCommand,
  heldMaskOf,
  holdModsTargetOf,
  parseHoldModsRaw,
  plainHoldOutputs,
  plainPartialHold,
  plainPartialHoldsRaw,
  readHoldMods,
  readHoldModsTarget,
  restoreHoldKeymap,
  restoreHoldMods,
  serializeHoldMods,
  validateHoldMods,
  validateHoldModsEntry,
  writeHoldMods,
  writeUncached,
} from "./holdMods";

// Cmd+Shift+Tab in slot 0 and slot 1, and its plain and legacy forms
const PARTIAL = 0x982b;
const PARTIAL_SLOT_1 = 0xb82b;
const PLAIN = 0x182b;
const LEGACY = 0x382b;
const GUI = 16;
const SHIFT = 8;

/* A keyboard that stores each table it is sent and replies with it */
const mockDevice = (stored: Record<string, string> = {}) => {
  const tables: Record<string, string> = { ...stored };
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      tables[cmd] = args.join(" ");
      return "";
    }

    return tables[cmd] ?? "0";
  });
  return { device: { noCacheCommand }, noCacheCommand, tables };
};

describe("hasHoldModsCommand", () => {
  test.each([
    ["version\r\nholdmods.map\r\nhelp", true], // Listed
    ["holdmods.mapX", false], // Another command
    ["", false], // Empty reply
    [undefined, false], // No reply
    [new Error(), false], // Failed request
  ])("hasHoldModsCommand(%j) is %s", (help, expected) => {
    expect(hasHoldModsCommand(help)).toBe(expected);
  });
});

describe("parseHoldModsRaw and serializeHoldMods", () => {
  test("parses a reply and serializes it sorted by code", () => {
    const parsed = parseHoldModsRaw(` 2 ${PARTIAL_SLOT_1} ${SHIFT} ${PARTIAL} ${GUI}\r\n`);

    expect(parsed).toEqual([
      { code: PARTIAL_SLOT_1, held: SHIFT },
      { code: PARTIAL, held: GUI },
    ]);
    expect(serializeHoldMods(parsed)).toBe(`2 ${PARTIAL} ${GUI} ${PARTIAL_SLOT_1} ${SHIFT}`);
  });

  test("an empty table reads and writes as 0", () => {
    expect(parseHoldModsRaw("0")).toEqual([]);
    expect(serializeHoldMods([])).toBe("0");
  });

  test.each([
    ["no reply", undefined],
    ["an empty reply", " "],
    ["a word", "error"],
    ["a missing value", `1 ${PARTIAL}`],
    ["a trailing value", `1 ${PARTIAL} ${GUI} 3`],
    ["a code above 16 bits", `1 65536 ${GUI}`],
    ["a held mask above a byte", `1 ${PARTIAL} 256`],
    ["more than 32 entries", `33${" 0 0".repeat(33)}`],
  ])("rejects %s", (_, raw) => {
    expect(parseHoldModsRaw(raw)).toBeNull();
  });
});

describe("validateHoldMods", () => {
  test.each([
    [{ code: PARTIAL, held: GUI }, null], // Cmd held, Shift tapped
    [{ code: 0x9f2b, held: 0x07 }, null], // Ctrl, Alt and AltGr held, Shift and Gui tapped
    [{ code: PARTIAL, held: 0 }, "are not modifiers"], // Nothing held
    [{ code: PARTIAL, held: 1 }, "are not modifiers"], // Ctrl is not in the shortcut
    [{ code: PARTIAL, held: GUI | SHIFT }, "holds all its modifiers"], // Every modifier held
    [{ code: 0x902b, held: GUI }, "not a partial hold"], // A single modifier
    [{ code: LEGACY, held: GUI }, "not a partial hold"], // Legacy hold
  ])("validateHoldModsEntry(%j) matches %s", (entry, expected) => {
    const invalid = validateHoldModsEntry(entry);

    if (expected === null) {
      expect(invalid).toBeNull();
    } else {
      expect(invalid).toContain(expected);
    }
  });

  test("rejects a repeated code", () => {
    expect(
      validateHoldMods([
        { code: PARTIAL, held: GUI },
        { code: PARTIAL, held: SHIFT },
      ]),
    ).toContain("repeats");
  });

  test("rejects more than 32 entries", () => {
    const list = Array.from({ length: MAX_HOLD_MODS + 1 }, (_, i) => ({ code: 0x9804 + i, held: GUI }));

    expect(validateHoldMods(list)).toContain("more than");
  });

  test("accepts both slots of one shortcut", () => {
    expect(
      validateHoldMods([
        { code: PARTIAL, held: GUI },
        { code: PARTIAL_SLOT_1, held: SHIFT },
      ]),
    ).toBeNull();
  });
});

describe("heldMaskOf", () => {
  const table = [{ code: PARTIAL, held: GUI }];

  test.each([
    [PARTIAL, GUI], // Entry
    [PARTIAL_SLOT_1, 0], // Orphan plays as the plain shortcut
    [LEGACY, GUI | SHIFT], // Legacy hold holds everything
    [PLAIN, 0], // Plain shortcut
    [54115, 0], // Autoshift a
  ])("heldMaskOf(%i) is %i", (code, expected) => {
    expect(heldMaskOf(table, code)).toBe(expected);
  });
});

describe("plain fallbacks", () => {
  test("plainPartialHold makes only partial holds plain", () => {
    expect([
      plainPartialHold(PARTIAL),
      plainPartialHold(PARTIAL_SLOT_1),
      plainPartialHold(LEGACY),
      plainPartialHold(0x902b),
    ]).toEqual([PLAIN, PLAIN, LEGACY, 0x902b]);
  });

  test("plainPartialHoldsRaw rewrites a keymap with partial holds", () => {
    expect(plainPartialHoldsRaw(`41 ${PARTIAL} ${LEGACY}\n${PARTIAL_SLOT_1} 65535 `)).toBe(
      `41 ${PLAIN} ${LEGACY} ${PLAIN} 65535`,
    );
  });

  test("plainPartialHoldsRaw returns a keymap without partial holds as it is", () => {
    const raw = `41 ${LEGACY}  65535\n`;

    expect(plainPartialHoldsRaw(raw)).toBe(raw);
  });

  test("plainHoldOutputs rewrites partial hold outputs and keeps an unchanged list", () => {
    const rules = [
      { layer: 2, position: 4, previous: 0x102b, output: PARTIAL },
      { layer: 2, position: 4, previous: 0x182b, output: LEGACY },
    ];
    const unchanged = [rules[1]];

    expect(plainHoldOutputs(rules)).toEqual([
      { layer: 2, position: 4, previous: 0x102b, output: PLAIN },
      { layer: 2, position: 4, previous: 0x182b, output: LEGACY },
    ]);
    expect(plainHoldOutputs(unchanged)).toBe(unchanged);
  });
});

describe("hold mods target", () => {
  test.each([
    [new Set([HOLD_MODS_COMMAND]), "listed"],
    [new Set(["keymap.custom"]), "unlisted"],
    [null, "unreadable"],
  ])("holdModsTargetOf(%j) is %s", (supported, expected) => {
    expect(holdModsTargetOf(supported)).toBe(expected);
  });

  test.each([
    ["listed", async (): Promise<unknown> => "keymap.custom\r\nholdmods.map"],
    ["unlisted", async (): Promise<unknown> => "keymap.custom"],
    ["unreadable", async (): Promise<unknown> => ""],
    ["unreadable", async (): Promise<unknown> => new Error("timeout")],
    ["unreadable", async (): Promise<unknown> => undefined],
    [
      "unreadable",
      async (): Promise<unknown> => {
        throw new Error("port closed");
      },
    ],
  ])("readHoldModsTarget gives %s", async (expected, reply) => {
    const noCacheCommand = vi.fn(reply);

    const target = await readHoldModsTarget({ noCacheCommand });

    expect(target).toBe(expected);
    expect(noCacheCommand.mock.calls).toEqual([["help"]]);
  });
});

describe("readHoldMods and writeHoldMods", () => {
  const TABLE = [
    { code: PARTIAL_SLOT_1, held: SHIFT },
    { code: PARTIAL, held: GUI },
  ];
  const SENT = `2 ${PARTIAL} ${GUI} ${PARTIAL_SLOT_1} ${SHIFT}`;

  test("readHoldMods reads the table uncached", async () => {
    const { device, noCacheCommand } = mockDevice({ [HOLD_MODS_COMMAND]: `1 ${PARTIAL} ${GUI}` });

    const table = await readHoldMods(device);

    expect(table).toEqual([{ code: PARTIAL, held: GUI }]);
    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND]]);
  });

  test("readHoldMods gives null for a reply that is not a table", async () => {
    const { device } = mockDevice({ [HOLD_MODS_COMMAND]: "error" });

    expect(await readHoldMods(device)).toBeNull();
  });

  test("writeHoldMods writes the sorted table and reads it back", async () => {
    const { device, noCacheCommand, tables } = mockDevice();

    await writeHoldMods(device, TABLE);

    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND, SENT], [HOLD_MODS_COMMAND]]);
    expect(tables[HOLD_MODS_COMMAND]).toBe(SENT);
  });

  test("writeHoldMods sends nothing for an invalid table", async () => {
    const { device, noCacheCommand } = mockDevice();

    await expect(writeHoldMods(device, [{ code: PARTIAL, held: GUI | SHIFT }])).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test.each([
    ["replies error", async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"), "rejected"],
    [
      "returns an Error",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
      "timeout",
    ],
    [
      "returns undefined",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? undefined : "0"),
      "answer",
    ],
    [
      "keeps its old table",
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"),
      "did not store",
    ],
  ])("writeHoldMods throws when the keyboard %s", async (_, reply, message) => {
    const noCacheCommand = vi.fn(reply);

    await expect(writeHoldMods({ noCacheCommand }, TABLE)).rejects.toThrow(message);
  });

  test("a failed write reads the table again, so the cache holds what the keyboard has", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(writeHoldMods({ noCacheCommand }, TABLE)).rejects.toThrow();
    expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND, SENT], [HOLD_MODS_COMMAND]]);
  });
});

describe("writeUncached", () => {
  test("sends the data uncached", async () => {
    const { device, noCacheCommand } = mockDevice();

    await writeUncached(device, "keymap.custom", "1 2 3");

    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", "1 2 3"]]);
  });

  test.each([
    ["an Error", new Error("timeout"), "timeout"],
    ["undefined", undefined, "answer"],
  ])("throws on %s and reads the command again", async (_, written, message) => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? written : "0"));

    await expect(writeUncached({ noCacheCommand }, "keymap.custom", "1 2 3")).rejects.toThrow(message);
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", "1 2 3"], ["keymap.custom"]]);
  });
});

describe("restoreHoldMods", () => {
  test("writes the backup's table on a target that lists it", async () => {
    const { device, tables } = mockDevice();

    const warning = await restoreHoldMods(device, `1 ${PARTIAL} ${GUI}`, "listed");

    expect(warning).toBeUndefined();
    expect(tables[HOLD_MODS_COMMAND]).toBe(`1 ${PARTIAL} ${GUI}`);
  });

  test.each([["unlisted"], ["unreadable"]] as const)("writes nothing and warns on an %s target", async target => {
    const { device, noCacheCommand } = mockDevice();

    const warning = await restoreHoldMods(device, `1 ${PARTIAL} ${GUI}`, target);

    expect(warning).toBe(HOLD_MODS_NOT_RESTORED);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("throws on a malformed entry without sending anything", async () => {
    const { device, noCacheCommand } = mockDevice();

    await expect(restoreHoldMods(device, `1 ${PARTIAL}`, "listed")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

describe("restoreHoldKeymap", () => {
  const KEYMAP = `41 ${PARTIAL} ${LEGACY}`;

  test("writes the keymap unchanged and uncached on a target that lists the table", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn();

    const warning = await restoreHoldKeymap(device, KEYMAP, "listed", sendPlain);

    expect(warning).toBeUndefined();
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", KEYMAP]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("throws when the keymap write fails on a target that lists the table", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(restoreHoldKeymap({ noCacheCommand }, "41 42", "listed", vi.fn())).rejects.toThrow("timeout");
  });

  test.each([["unlisted"], ["unreadable"]] as const)("makes partial holds plain and warns on an %s target", async target => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn();

    const warning = await restoreHoldKeymap(device, KEYMAP, target, sendPlain);

    expect(warning).toBe(HOLD_MODS_NORMALIZED);
    expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", `41 ${PLAIN} ${LEGACY}`]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("sends a keymap without partial holds plain on a target without the table", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    const warning = await restoreHoldKeymap(device, `41 ${LEGACY}`, "unlisted", sendPlain);

    expect(warning).toBeUndefined();
    expect(sendPlain).toHaveBeenCalledTimes(1);
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});
