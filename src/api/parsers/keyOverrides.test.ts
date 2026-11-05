import { describe, expect, test, vi } from "vitest";
import { KeyOverride } from "@Renderer/types/keyOverrides";
import { ALT_REPEAT_COMMAND, needsAltRepeatClear } from "./altRepeat";
import {
  KEY_OVERRIDES_COMMAND,
  KO_ALL_LAYERS,
  KO_NO_REREGISTER,
  KO_ONE_MOD,
  KO_OPTIONS_DEFAULT,
  KO_TRIGGER_DOWN,
  KeyOverridesDevice,
  MAX_KEY_OVERRIDES,
  MOD_ALT,
  MOD_CTRL,
  MOD_GUI,
  MOD_SHIFT,
  hasKeyOverridesCommand,
  layerSummary,
  moveKeyOverride,
  needsKeyOverridesClear,
  newKeyOverride,
  overlapsEarlier,
  parseKeyOverridesRaw,
  readKeyOverrides,
  restoreKeyOverrides,
  serializeKeyOverrides,
  splitTriggerCode,
  triggerCode,
  validateKeyOverride,
  validateKeyOverrides,
  withTriggerMods,
  writeKeyOverrides,
} from "./keyOverrides";

const BACKSPACE = 0x2a;
const DELETE = 0x4c;
const Q = 0x14;

/* Shift+Backspace sends Delete, with QMK's defaults */
const shiftBackspace: KeyOverride = {
  trigger: BACKSPACE,
  triggerMods: MOD_SHIFT,
  layers: KO_ALL_LAYERS,
  negativeMods: 0,
  suppressedMods: MOD_SHIFT,
  replacement: DELETE,
  options: KO_OPTIONS_DEFAULT,
  enabled: true,
};

/* Cmd+Q sends nothing, only on layers 1 and 2 and switched off */
const blockQ: KeyOverride = {
  trigger: Q,
  triggerMods: MOD_GUI,
  layers: 0x003,
  negativeMods: MOD_CTRL,
  suppressedMods: MOD_GUI,
  replacement: 0,
  options: 0x21,
  enabled: false,
};

const SHIFT_BACKSPACE_WIRE = "42 8 1023 0 8 76 7 1";
const BLOCK_Q_WIRE = "20 16 3 1 16 0 33 0";

const fill = (count: number): KeyOverride[] => Array.from({ length: count }, (_, i) => ({ ...shiftBackspace, trigger: 4 + i }));

/* A keyboard that stores what it is sent, or keeps its table and replies `error` when `reject` is set */
const fakeDevice = (initial = "0", reject = false) => {
  let table = initial;
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (cmd !== KEY_OVERRIDES_COMMAND) {
      return "";
    }

    if (args.length > 0) {
      if (reject) {
        return "error";
      }

      table = args.join(" ");
      return "";
    }

    return table;
  });
  const device: KeyOverridesDevice = { noCacheCommand };
  return { device, noCacheCommand };
};

describe("hasKeyOverridesCommand", () => {
  test("finds the exact command line in help", () => {
    expect(hasKeyOverridesCommand("version\r\nkeyoverrides.map\r\nhelp")).toBe(true);
    expect(hasKeyOverridesCommand("version\n  keyoverrides.map  \nhelp")).toBe(true);
    expect(hasKeyOverridesCommand("keyoverrides.mapX")).toBe(false);
    expect(hasKeyOverridesCommand("")).toBe(false);
    expect(hasKeyOverridesCommand(undefined)).toBe(false);
    expect(hasKeyOverridesCommand(new Error("timeout"))).toBe(false);
  });
});

describe("parseKeyOverridesRaw", () => {
  test("reads an empty table", () => {
    expect(parseKeyOverridesRaw("0")).toEqual([]);
  });

  test("reads one override with the fields in wire order", () => {
    expect(parseKeyOverridesRaw(`1 ${SHIFT_BACKSPACE_WIRE}`)).toEqual([shiftBackspace]);
  });

  test("reads 32 overrides", () => {
    expect(parseKeyOverridesRaw(serializeKeyOverrides(fill(32)))).toHaveLength(32);
  });

  test.each([
    ["more than 32", `33 ${Array.from({ length: 33 }, () => SHIFT_BACKSPACE_WIRE).join(" ")}`],
    ["too few values", `1 ${SHIFT_BACKSPACE_WIRE.split(" ").slice(0, 7).join(" ")}`],
    ["too many values", `1 ${SHIFT_BACKSPACE_WIRE} 1`],
    ["a non-digit", "1 42 8 1023 0 8 76 7 x"],
    ["a negative value", "1 42 8 1023 0 8 76 7 -1"],
    ["a value above 0xffff", "1 42 8 65536 0 8 76 7 1"],
    ["an empty reply", ""],
    ["a blank reply", "  \r\n"],
  ])("rejects %s", (_, raw) => {
    expect(parseKeyOverridesRaw(raw)).toBeNull();
  });

  test("rejects a reply that is not a string", () => {
    expect(parseKeyOverridesRaw(new Error("timeout"))).toBeNull();
    expect(parseKeyOverridesRaw(undefined)).toBeNull();
  });
});

describe("serializeKeyOverrides", () => {
  test("keeps the list order and sends enabled as 1 or 0", () => {
    expect(serializeKeyOverrides([blockQ, shiftBackspace])).toBe(`2 ${BLOCK_Q_WIRE} ${SHIFT_BACKSPACE_WIRE}`);
  });

  test("sends 0 for an empty list", () => {
    expect(serializeKeyOverrides([])).toBe("0");
  });

  test("round-trips through the parser", () => {
    const wire = `2 ${SHIFT_BACKSPACE_WIRE} ${BLOCK_Q_WIRE}`;

    expect(serializeKeyOverrides(parseKeyOverridesRaw(wire))).toBe(wire);
  });
});

describe("validateKeyOverride", () => {
  test("accepts the examples", () => {
    expect(validateKeyOverride(shiftBackspace)).toBeNull();
    expect(validateKeyOverride(blockQ)).toBeNull();
  });

  test.each([
    [3, false],
    [4, true],
    [0xdd, true],
    [0xde, false],
    [0xe1, false],
  ])("trigger %i valid: %s", (trigger, valid) => {
    expect(validateKeyOverride({ ...shiftBackspace, trigger }) === null).toBe(valid);
  });

  test("rejects AltGr in a modifier mask, since the firmware folds it into Alt", () => {
    expect(validateKeyOverride({ ...shiftBackspace, triggerMods: 0x04 })).not.toBeNull();
    expect(validateKeyOverride({ ...shiftBackspace, negativeMods: 0x04 })).not.toBeNull();
    expect(validateKeyOverride({ ...shiftBackspace, suppressedMods: 0x04 })).not.toBeNull();
  });

  test("rejects a modifier mask above the four modifiers", () => {
    expect(validateKeyOverride({ ...shiftBackspace, suppressedMods: 0x20 })).not.toBeNull();
  });

  test("rejects a modifier that is both required and forbidden", () => {
    expect(validateKeyOverride({ ...shiftBackspace, negativeMods: MOD_SHIFT })).not.toBeNull();
    expect(validateKeyOverride({ ...shiftBackspace, negativeMods: MOD_CTRL | MOD_ALT | MOD_GUI })).toBeNull();
  });

  test.each([
    [0, false],
    [1, true],
    [0x3ff, true],
    [0x400, false],
  ])("layers %i valid: %s", (layers, valid) => {
    expect(validateKeyOverride({ ...shiftBackspace, layers }) === null).toBe(valid);
  });

  test.each([
    [0, true],
    [0x01, true],
    [0x02, true],
    [0x04, true],
    [0x08, true],
    [0x10, true],
    [0x20, true],
    [0x3f, true],
    [0x40, false],
  ])("options %i valid: %s", (options, valid) => {
    expect(validateKeyOverride({ ...shiftBackspace, options }) === null).toBe(valid);
  });

  test.each([
    [0, true], // block
    [0x082a, true], // Shift+Backspace
    [0x1f04, true], // every modifier with AltGr + a
    [0x2004, false], // a layer hold flag
    [0x00e1, false], // a modifier alone
    [0x0003, false], // below the first keyboard key
  ])("replacement %i valid: %s", (replacement, valid) => {
    expect(validateKeyOverride({ ...shiftBackspace, replacement }) === null).toBe(valid);
  });

  test("rejects 33 overrides", () => {
    expect(validateKeyOverrides(fill(32))).toBeNull();
    expect(validateKeyOverrides(fill(33))).not.toBeNull();
  });

  test("names the first invalid override", () => {
    expect(validateKeyOverrides([shiftBackspace, { ...shiftBackspace, layers: 0 }])).toMatch(/^override 1/);
  });
});

describe("splitTriggerCode", () => {
  test("splits a shortcut into trigger and required modifiers", () => {
    expect(splitTriggerCode(0x082a)).toEqual({ trigger: BACKSPACE, triggerMods: MOD_SHIFT });
    expect(splitTriggerCode(0x2a)).toEqual({ trigger: BACKSPACE, triggerMods: 0 });
  });

  test("folds AltGr into Alt", () => {
    expect(splitTriggerCode(0x0414)).toEqual({ trigger: Q, triggerMods: MOD_ALT });
    expect(splitTriggerCode(0x0614)).toEqual({ trigger: Q, triggerMods: MOD_ALT });
  });

  test("rejects modifiers alone, special keys and keys out of range", () => {
    expect(splitTriggerCode(0)).toBeNull();
    expect(splitTriggerCode(0xe1)).toBeNull();
    expect(splitTriggerCode(0x2004)).toBeNull();
    expect(splitTriggerCode(53852)).toBeNull();
    expect(splitTriggerCode(-1)).toBeNull();
  });

  test("triggerCode joins them again", () => {
    expect(triggerCode(shiftBackspace)).toBe(0x082a);
  });
});

describe("list helpers", () => {
  test("newKeyOverride takes QMK's defaults and suppresses the required modifiers", () => {
    expect(newKeyOverride(BACKSPACE, MOD_SHIFT, DELETE)).toEqual(shiftBackspace);
  });

  test("withTriggerMods moves suppression along when it equalled the required modifiers", () => {
    expect(withTriggerMods(shiftBackspace, MOD_CTRL)).toEqual({
      ...shiftBackspace,
      triggerMods: MOD_CTRL,
      suppressedMods: MOD_CTRL,
    });
  });

  test("withTriggerMods keeps a custom suppression and drops newly required modifiers from the forbidden ones", () => {
    const custom = { ...shiftBackspace, suppressedMods: 0, negativeMods: MOD_CTRL | MOD_GUI };

    expect(withTriggerMods(custom, MOD_SHIFT | MOD_CTRL)).toEqual({
      ...custom,
      triggerMods: MOD_SHIFT | MOD_CTRL,
      suppressedMods: 0,
      negativeMods: MOD_GUI,
    });
  });

  test("moveKeyOverride moves a row and ignores moves out of range", () => {
    expect(moveKeyOverride(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveKeyOverride(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveKeyOverride(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveKeyOverride(["a", "b"], 1, 2)).toEqual(["a", "b"]);
  });

  test.each([
    [KO_ALL_LAYERS, "all"],
    [0x001, "1"],
    [0x007, "1-3"],
    [0x205, "1, 3, 10"],
    [0x1fe, "2-9"],
  ])("layerSummary %i is %s", (layers, summary) => {
    expect(layerSummary(layers, "all")).toBe(summary);
  });
});

describe("overlapsEarlier", () => {
  test("an earlier row on every layer wins over the same override on fewer layers", () => {
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, layers: 0x002, replacement: 0 }], 1)).toBe(0);
  });

  test("an earlier row on fewer layers does not always win", () => {
    expect(overlapsEarlier([{ ...shiftBackspace, layers: 0x002 }, shiftBackspace], 1)).toBe(-1);
  });

  test("a disabled earlier row does not count", () => {
    expect(overlapsEarlier([{ ...shiftBackspace, enabled: false }, shiftBackspace], 1)).toBe(-1);
  });

  test("a different one_mod bit does not count", () => {
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, options: KO_OPTIONS_DEFAULT | KO_ONE_MOD }], 1)).toBe(-1);
  });

  test("an activation bit the earlier row lacks does not count", () => {
    expect(overlapsEarlier([{ ...shiftBackspace, options: KO_TRIGGER_DOWN }, shiftBackspace], 1)).toBe(-1);
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, options: KO_TRIGGER_DOWN }], 1)).toBe(0);
  });

  test("no activation bit means all of them", () => {
    expect(overlapsEarlier([{ ...shiftBackspace, options: 0 }, shiftBackspace], 1)).toBe(0);
  });

  test("other options do not matter, and a different trigger, required or forbidden modifiers do not count", () => {
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, options: KO_OPTIONS_DEFAULT | KO_NO_REREGISTER }], 1)).toBe(0);
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, trigger: Q }], 1)).toBe(-1);
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, triggerMods: MOD_CTRL }], 1)).toBe(-1);
    expect(overlapsEarlier([shiftBackspace, { ...shiftBackspace, negativeMods: MOD_CTRL }], 1)).toBe(-1);
  });

  test("the first row and a missing row have no earlier row", () => {
    expect(overlapsEarlier([shiftBackspace], 0)).toBe(-1);
    expect(overlapsEarlier([shiftBackspace], 3)).toBe(-1);
  });
});

describe("restore clear helpers", () => {
  test("both clears read one shared set of supported commands", () => {
    const supported = new Set(["keymap.custom", ALT_REPEAT_COMMAND, KEY_OVERRIDES_COMMAND]);

    expect(needsKeyOverridesClear(["keymap.custom"], supported)).toBe(true);
    expect(needsAltRepeatClear(["keymap.custom"], supported)).toBe(true);
    expect(needsKeyOverridesClear(["keymap.custom", KEY_OVERRIDES_COMMAND], supported)).toBe(false);
    expect(needsAltRepeatClear(["keymap.custom", KEY_OVERRIDES_COMMAND], supported)).toBe(true);
  });

  test("no clear when the keyboard lacks the command or its list is unknown", () => {
    expect(needsKeyOverridesClear(["keymap.custom"], new Set(["keymap.custom", ALT_REPEAT_COMMAND]))).toBe(false);
    expect(needsKeyOverridesClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("readKeyOverrides", () => {
  test("reads the table", async () => {
    const { device } = fakeDevice(`1 ${SHIFT_BACKSPACE_WIRE}`);

    expect(await readKeyOverrides(device)).toEqual([shiftBackspace]);
  });

  test("returns null on an Error reply, a thrown error or a malformed reply", async () => {
    expect(await readKeyOverrides({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(
      await readKeyOverrides({
        noCacheCommand: async () => {
          throw new Error("closed");
        },
      }),
    ).toBeNull();
    expect(await readKeyOverrides({ noCacheCommand: async () => "2 1" })).toBeNull();
  });
});

describe("writeKeyOverrides", () => {
  test("writes the serialisation, then reads it back uncached", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeKeyOverrides(device, [shiftBackspace, blockQ]);

    expect(noCacheCommand.mock.calls).toEqual([
      [KEY_OVERRIDES_COMMAND, `2 ${SHIFT_BACKSPACE_WIRE} ${BLOCK_Q_WIRE}`],
      [KEY_OVERRIDES_COMMAND],
    ]);
  });

  test("accepts the virtual keyboard, which echoes the payload", async () => {
    let table = "0";
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => {
      if (args.length > 0) {
        table = args.join(" ");
      }

      return table;
    });

    await writeKeyOverrides({ noCacheCommand }, [shiftBackspace]);

    expect(noCacheCommand).toHaveBeenCalledTimes(2);
    expect(table).toBe(`1 ${SHIFT_BACKSPACE_WIRE}`);
  });

  test("rejects invalid overrides without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeKeyOverrides(device, [{ ...shiftBackspace, layers: 0 }])).rejects.toThrow();
    await expect(writeKeyOverrides(device, fill(33))).rejects.toThrow();
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects the firmware's error reply", async () => {
    const { device, noCacheCommand } = fakeDevice("0", true);

    await expect(writeKeyOverrides(device, [shiftBackspace])).rejects.toThrow("rejected");
    expect(noCacheCommand).toHaveBeenCalledTimes(1);
  });

  test("rejects an Error reply", async () => {
    const device: KeyOverridesDevice = { noCacheCommand: async () => new Error("timeout") };

    await expect(writeKeyOverrides(device, [])).rejects.toThrow("timeout");
  });

  test("rejects a thrown transport error", async () => {
    const device: KeyOverridesDevice = {
      noCacheCommand: async () => {
        throw new Error("port closed");
      },
    };

    await expect(writeKeyOverrides(device, [])).rejects.toThrow("port closed");
  });

  test("rejects a different table read back", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(writeKeyOverrides({ noCacheCommand }, [shiftBackspace])).rejects.toThrow("did not store");
  });

  test("rejects a read-back that is not a table", async () => {
    const noCacheCommand = vi.fn(async (): Promise<unknown> => undefined);

    await expect(writeKeyOverrides({ noCacheCommand }, [])).rejects.toThrow();
  });
});

describe("restoreKeyOverrides", () => {
  test("writes a valid backup entry and reads it back", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await restoreKeyOverrides(device, `1 ${SHIFT_BACKSPACE_WIRE}`);

    expect(noCacheCommand.mock.calls).toEqual([[KEY_OVERRIDES_COMMAND, `1 ${SHIFT_BACKSPACE_WIRE}`], [KEY_OVERRIDES_COMMAND]]);
  });

  test("rejects malformed data without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreKeyOverrides(device, "[object Object]")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard refuses the table", async () => {
    const { device } = fakeDevice("0", true);

    await expect(restoreKeyOverrides(device, `1 ${SHIFT_BACKSPACE_WIRE}`)).rejects.toThrow();
  });

  test("the limit is the firmware's 32", () => {
    expect(MAX_KEY_OVERRIDES).toBe(32);
  });
});
