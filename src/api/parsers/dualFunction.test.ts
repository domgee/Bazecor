import { describe, expect, test, vi } from "vitest";
import {
  DUAL_FUNCTION_COMMAND,
  DUAL_FUNCTION_DEFAULTS,
  DualFunctionGlobals,
  MAX_PER_KEY,
  NEUTRALIZER_OPTIONS,
  PER_KEY_COMMAND,
  PerKeyOverride,
  VALID_POSITIONS,
  handOfPosition,
  hasDualFunctionCommands,
  isOverrideEmpty,
  isValidNeutralizer,
  needsDualFunctionClear,
  needsPerKeyClear,
  parseDualFunctionGlobals,
  parsePerKeyOverrides,
  readDualFunctionGlobals,
  readPerKeyOverrides,
  restoreDualFunctionGlobals,
  restorePerKeyOverrides,
  saveDualFunctionGlobals,
  serializeDualFunctionGlobals,
  serializePerKeyOverrides,
  validateDualFunctionGlobals,
  validatePerKeyOverrides,
  writeDualFunctionGlobals,
  writePerKeyOverrides,
} from "./dualFunction";

const GLOBAL_KEY: Omit<PerKeyOverride, "position"> = {
  holdTimeout: null,
  quickTapTerm: null,
  priorInterval: null,
  mode: null,
  chordal: null,
  speculative: null,
  retro: null,
};

const override = (position: number, fields: Partial<PerKeyOverride>): PerKeyOverride => ({ ...GLOBAL_KEY, position, ...fields });

const ALL_ON: DualFunctionGlobals = {
  mode: 1,
  chordal: true,
  speculative: true,
  speculativeOneKey: true,
  speculativeFlowTerm: 120,
  retro: true,
  neutralizer: 0x6d,
};

/* Store what each command is sent and reply with it, or reply `error` to every write when `reject` is set */
const fakeDevice = (initial: Record<string, string> = {}, reject = false) => {
  const keyboard: Record<string, string> = { [DUAL_FUNCTION_COMMAND]: "0 0 0 0 0 0 0", [PER_KEY_COMMAND]: "0", ...initial };
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      if (reject) {
        return "error";
      }

      keyboard[cmd] = args.join(" ");
      return "";
    }

    return keyboard[cmd] ?? "";
  });
  return { device: { noCacheCommand }, keyboard, noCacheCommand };
};

/* Echo each write as the virtual keyboard does */
const virtualDevice = () => {
  const keyboard: Record<string, string> = { [DUAL_FUNCTION_COMMAND]: "0 0 0 0 0 0 0", [PER_KEY_COMMAND]: "0" };
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      keyboard[cmd] = args.join(" ");
    }

    return keyboard[cmd];
  });
  return { device: { noCacheCommand }, keyboard, noCacheCommand };
};

describe("hasDualFunctionCommands", () => {
  test("needs both command lines in help", () => {
    expect(hasDualFunctionCommands("version\r\nqukeys.dualFunction\r\nqukeys.perKey\r\nhelp")).toBe(true);
    expect(hasDualFunctionCommands("  qukeys.perKey \n qukeys.dualFunction  ")).toBe(true);
  });

  test.each([
    ["undefined", undefined],
    ["an Error", new Error("timeout")],
    ["help without either line", "version\r\nqukeys.quickTapTerm"],
    ["help with only qukeys.dualFunction", "qukeys.dualFunction\r\nqukeys.quickTapTerm"],
    ["help with only qukeys.perKey", "qukeys.perKey\r\nqukeys.quickTapTerm"],
    ["lines that only contain the commands", "qukeys.dualFunctionX\r\nxqukeys.perKey"],
  ])("rejects %s", (_, help) => {
    expect(hasDualFunctionCommands(help)).toBe(false);
  });
});

describe("isValidNeutralizer", () => {
  test.each([0, 4, 0x68, 0xdd, 0xe0, 0xe4, 0xe7])("accepts %i", value => {
    expect(isValidNeutralizer(value)).toBe(true);
  });

  test.each([1, 3, 0xde, 0xdf, 0xe8, 255, -1, 1.5, "104", null])("rejects %s", value => {
    expect(isValidNeutralizer(value)).toBe(false);
  });

  test("offers only keys the firmware accepts, Off first", () => {
    expect(NEUTRALIZER_OPTIONS[0].value).toBe(0);
    expect(NEUTRALIZER_OPTIONS.map(o => o.label)).toContain("F18");
    expect(NEUTRALIZER_OPTIONS.find(o => o.label === "F18")?.value).toBe(0x6d);
    expect(NEUTRALIZER_OPTIONS.every(o => isValidNeutralizer(o.value))).toBe(true);
  });
});

describe("handOfPosition", () => {
  test.each([
    [0, "left"],
    [5, "left"],
    [6, "right"],
    [11, "right"],
    [36, "left"],
    [47, "right"],
    [48, "thumb"],
    [51, "thumb"],
    [56, "thumb"],
    [59, "thumb"],
  ])("puts position %i on the %s side", (position, hand) => {
    expect(handOfPosition(position)).toBe(hand);
  });

  test.each([52, 55, 60, -1, 1.5])("returns null for %s, which the Sonsei lacks", position => {
    expect(handOfPosition(position)).toBeNull();
  });

  test("lists 56 positions without 52..55", () => {
    expect(VALID_POSITIONS).toHaveLength(56);
    expect(MAX_PER_KEY).toBe(56);
    expect(VALID_POSITIONS.filter(p => p >= 52 && p <= 55)).toEqual([]);
  });
});

describe("global options", () => {
  test("parses the defaults with every option off", () => {
    expect(parseDualFunctionGlobals("0 0 0 0 0 0 0")).toEqual(DUAL_FUNCTION_DEFAULTS);
  });

  test("round trips every field in wire order", () => {
    const text = serializeDualFunctionGlobals(ALL_ON);

    expect(text).toBe("1 1 1 1 120 1 109");
    expect(parseDualFunctionGlobals(` ${text}\r\n`)).toEqual(ALL_ON);
  });

  test("accepts the boundary values", () => {
    expect(parseDualFunctionGlobals("2 0 0 0 250 0 231")).toEqual({
      ...DUAL_FUNCTION_DEFAULTS,
      mode: 2,
      speculativeFlowTerm: 250,
      neutralizer: 231,
    });
    expect(parseDualFunctionGlobals("0 0 0 0 0 0 4")?.neutralizer).toBe(4);
    expect(parseDualFunctionGlobals("0 0 0 0 0 0 221")?.neutralizer).toBe(221);
    expect(parseDualFunctionGlobals("0 0 0 0 0 0 224")?.neutralizer).toBe(224);
  });

  test.each([
    ["mode 3", "3 0 0 0 0 0 0"],
    ["chordal 2", "0 2 0 0 0 0 0"],
    ["speculative 2", "0 0 2 0 0 0 0"],
    ["one key 2", "0 0 0 2 0 0 0"],
    ["flow term 251", "0 0 0 0 251 0 0"],
    ["retro 2", "0 0 0 0 0 2 0"],
    ["neutralizer 3", "0 0 0 0 0 0 3"],
    ["neutralizer 222", "0 0 0 0 0 0 222"],
    ["neutralizer 232", "0 0 0 0 0 0 232"],
    ["six values", "0 0 0 0 0 0"],
    ["eight values", "0 0 0 0 0 0 0 0"],
    ["a negative value", "0 0 0 0 -1 0 0"],
    ["text", "0 0 0 0 a 0 0"],
    ["an empty reply", ""],
    ["an Error", new Error("timeout")],
    ["undefined", undefined],
  ])("rejects %s", (_, raw) => {
    expect(parseDualFunctionGlobals(raw)).toBeNull();
  });

  test("validates like the firmware", () => {
    expect(validateDualFunctionGlobals(ALL_ON)).toBeNull();
    expect(validateDualFunctionGlobals({ ...ALL_ON, mode: 3 })).toMatch("mode");
    expect(validateDualFunctionGlobals({ ...ALL_ON, speculativeFlowTerm: 251 })).toMatch("flow term");
    expect(validateDualFunctionGlobals({ ...ALL_ON, speculativeFlowTerm: 2.5 })).toMatch("flow term");
    expect(validateDualFunctionGlobals({ ...ALL_ON, neutralizer: 0xe8 })).toMatch("neutralizer");
  });
});

describe("per-key overrides", () => {
  test("parses an empty table", () => {
    expect(parsePerKeyOverrides("0")).toEqual([]);
  });

  test("maps the global sentinels to null", () => {
    expect(parsePerKeyOverrides("1 13 300 65535 255 3 1 3 0")).toEqual([
      override(13, { holdTimeout: 300, chordal: true, retro: false }),
    ]);
  });

  test("round trips every field and the boundary values", () => {
    const list = [
      override(0, {
        holdTimeout: 1,
        quickTapTerm: 0,
        priorInterval: 0,
        mode: 0,
        chordal: false,
        speculative: false,
        retro: false,
      }),
      override(59, {
        holdTimeout: 2000,
        quickTapTerm: 1000,
        priorInterval: 254,
        mode: 2,
        chordal: true,
        speculative: true,
        retro: true,
      }),
    ];
    const text = serializePerKeyOverrides(list);

    expect(text).toBe("2 0 1 0 0 0 0 0 0 59 2000 1000 254 2 1 1 1");
    expect(parsePerKeyOverrides(text)).toEqual(list);
  });

  test("serializes in ascending position order with sentinels, as the keyboard sends", () => {
    const list = [override(40, { mode: 1 }), override(3, { speculative: true })];

    expect(serializePerKeyOverrides(list)).toBe("2 3 65535 65535 255 3 3 1 3 40 65535 65535 255 1 3 3 3");
  });

  test("sorts a table sent out of order", () => {
    expect(parsePerKeyOverrides("2 40 65535 65535 255 1 3 3 3 3 65535 65535 255 3 3 1 3")?.map(o => o.position)).toEqual([3, 40]);
  });

  test("drops entries with no override, which the keyboard never sends", () => {
    expect(parsePerKeyOverrides("2 7 65535 65535 255 3 3 3 3 8 250 65535 255 3 3 3 3")).toEqual([
      override(8, { holdTimeout: 250 }),
    ]);
    expect(serializePerKeyOverrides([override(7, {}), override(8, { holdTimeout: 250 })])).toBe("1 8 250 65535 255 3 3 3 3");
  });

  test("accepts 56 entries and every existing position", () => {
    const list = VALID_POSITIONS.map(position => override(position, { mode: 1 }));

    expect(parsePerKeyOverrides(serializePerKeyOverrides(list))).toEqual(list);
    expect(validatePerKeyOverrides(list)).toBeNull();
  });

  test.each([
    ["position 52", "1 52 65535 65535 255 1 3 3 3"],
    ["position 55", "1 55 65535 65535 255 1 3 3 3"],
    ["an all-global position 53", "1 53 65535 65535 255 3 3 3 3"],
    ["position 60", "1 60 65535 65535 255 1 3 3 3"],
    ["a repeated position", "2 3 65535 65535 255 1 3 3 3 3 65535 65535 255 2 3 3 3"],
    ["hold timeout 0", "1 3 0 65535 255 3 3 3 3"],
    ["hold timeout 2001", "1 3 2001 65535 255 3 3 3 3"],
    ["quick tap 1001", "1 3 65535 1001 255 3 3 3 3"],
    ["prior interval 256", "1 3 65535 65535 256 3 3 3 3"],
    ["mode 4", "1 3 65535 65535 255 4 3 3 3"],
    ["chordal 2", "1 3 65535 65535 255 3 2 3 3"],
    ["speculative 2", "1 3 65535 65535 255 3 3 2 3"],
    ["retro 2", "1 3 65535 65535 255 3 3 3 2"],
    ["retro 4", "1 3 65535 65535 255 3 3 3 4"],
    ["a value above 65535", "1 3 65536 65535 255 3 3 3 3"],
    ["a count above the entries", "2 3 65535 65535 255 1 3 3 3"],
    ["a count below the entries", "0 3 65535 65535 255 1 3 3 3"],
    ["a short entry", "1 3 65535 65535 255 1 3 3"],
    ["a count above 56", "57"],
    ["text", "1 3 x 65535 255 1 3 3 3"],
    ["an empty reply", ""],
    ["an Error", new Error("timeout")],
  ])("rejects %s", (_, raw) => {
    expect(parsePerKeyOverrides(raw)).toBeNull();
  });

  test("validates like the firmware", () => {
    expect(validatePerKeyOverrides([override(3, { holdTimeout: 2000 })])).toBeNull();
    expect(validatePerKeyOverrides([override(52, { mode: 1 })])).toMatch("position");
    expect(validatePerKeyOverrides([override(3, { holdTimeout: 0 })])).toMatch("hold timeout");
    expect(validatePerKeyOverrides([override(3, { quickTapTerm: 1001 })])).toMatch("quick tap");
    expect(validatePerKeyOverrides([override(3, { priorInterval: 255 })])).toMatch("prior interval");
    expect(validatePerKeyOverrides([override(3, { mode: 3 })])).toMatch("mode");
    expect(validatePerKeyOverrides([override(3, { mode: 1 }), override(3, { mode: 2 })])).toMatch("repeats");
    expect(validatePerKeyOverrides(Array.from({ length: 57 }, (_, i) => override(i, { mode: 1 })))).toMatch("more than 56");
  });

  test("isOverrideEmpty is true only when every field is global", () => {
    expect(isOverrideEmpty(override(3, {}))).toBe(true);
    expect(isOverrideEmpty(override(3, { retro: false }))).toBe(false);
    expect(isOverrideEmpty(override(3, { quickTapTerm: 0 }))).toBe(false);
  });
});

describe("needsDualFunctionClear and needsPerKeyClear", () => {
  const supported = new Set(["keymap.custom", DUAL_FUNCTION_COMMAND, PER_KEY_COMMAND]);

  test("clear only when the keyboard has the command and the backup lacks it", () => {
    expect(needsDualFunctionClear(["keymap.custom"], supported)).toBe(true);
    expect(needsPerKeyClear(["keymap.custom"], supported)).toBe(true);
    expect(needsDualFunctionClear(["keymap.custom", DUAL_FUNCTION_COMMAND], supported)).toBe(false);
    expect(needsPerKeyClear(["keymap.custom", PER_KEY_COMMAND], supported)).toBe(false);
    expect(needsDualFunctionClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsPerKeyClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsDualFunctionClear(["keymap.custom"], null)).toBe(false);
    expect(needsPerKeyClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("reads", () => {
  test("read the options and the overrides", async () => {
    const { device } = fakeDevice({
      [DUAL_FUNCTION_COMMAND]: "1 1 1 1 120 1 109",
      [PER_KEY_COMMAND]: "1 8 250 65535 255 3 3 3 3",
    });

    expect(await readDualFunctionGlobals(device)).toEqual(ALL_ON);
    expect(await readPerKeyOverrides(device)).toEqual([override(8, { holdTimeout: 250 })]);
  });

  test("return null on an Error reply, a thrown error or an error reply", async () => {
    const throwing = {
      noCacheCommand: async () => {
        throw new Error("closed");
      },
    };

    expect(await readDualFunctionGlobals({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(await readDualFunctionGlobals(throwing)).toBeNull();
    expect(await readDualFunctionGlobals({ noCacheCommand: async () => "error" })).toBeNull();
    expect(await readPerKeyOverrides({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(await readPerKeyOverrides(throwing)).toBeNull();
    expect(await readPerKeyOverrides({ noCacheCommand: async () => "error" })).toBeNull();
  });
});

describe("writeDualFunctionGlobals", () => {
  test("writes the options, then reads them back uncached", async () => {
    const { device, keyboard, noCacheCommand } = fakeDevice();

    await writeDualFunctionGlobals(device, ALL_ON);

    expect(noCacheCommand.mock.calls).toEqual([[DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"], [DUAL_FUNCTION_COMMAND]]);
    expect(keyboard[DUAL_FUNCTION_COMMAND]).toBe("1 1 1 1 120 1 109");
  });

  test("accepts the virtual keyboard's echo", async () => {
    const { device, keyboard } = virtualDevice();

    await writeDualFunctionGlobals(device, ALL_ON);

    expect(keyboard[DUAL_FUNCTION_COMMAND]).toBe("1 1 1 1 120 1 109");
  });

  test("rejects invalid options without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeDualFunctionGlobals(device, { ...ALL_ON, mode: 3 })).rejects.toThrow("not sent");
    await expect(writeDualFunctionGlobals(device, { ...ALL_ON, neutralizer: 2 })).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects the firmware's error reply and reads the kept options back into the cache", async () => {
    const { device, noCacheCommand } = fakeDevice({ [DUAL_FUNCTION_COMMAND]: "2 0 0 0 0 0 0" }, true);

    await expect(writeDualFunctionGlobals(device, ALL_ON)).rejects.toThrow("rejected");
    expect(noCacheCommand.mock.calls).toEqual([[DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"], [DUAL_FUNCTION_COMMAND]]);
    expect(await noCacheCommand.mock.results[1].value).toBe("2 0 0 0 0 0 0");
  });

  test("rejects an Error reply to the write and reads the options again", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0 0 0 0 0 0 0"),
    );

    await expect(writeDualFunctionGlobals({ noCacheCommand }, ALL_ON)).rejects.toThrow("timeout");
    expect(noCacheCommand.mock.calls).toEqual([[DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"], [DUAL_FUNCTION_COMMAND]]);
  });

  test("rejects an Error read-back and reads the options again", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : new Error("timeout")),
    );

    await expect(writeDualFunctionGlobals({ noCacheCommand }, ALL_ON)).rejects.toThrow("timeout");
    expect(noCacheCommand.mock.calls).toEqual([
      [DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"],
      [DUAL_FUNCTION_COMMAND],
      [DUAL_FUNCTION_COMMAND],
    ]);
  });

  test("rejects a read-back that differs from the options sent", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0 0 0 0 0 0 0"),
    );

    await expect(writeDualFunctionGlobals({ noCacheCommand }, ALL_ON)).rejects.toThrow("did not store");
  });
});

describe("writePerKeyOverrides", () => {
  const list = [override(40, { mode: 1 }), override(3, { holdTimeout: 300, speculative: true })];
  const sent = "2 3 300 65535 255 3 3 1 3 40 65535 65535 255 1 3 3 3";

  test("writes the table in canonical order, then reads it back uncached", async () => {
    const { device, keyboard, noCacheCommand } = fakeDevice();

    await writePerKeyOverrides(device, list);

    expect(noCacheCommand.mock.calls).toEqual([[PER_KEY_COMMAND, sent], [PER_KEY_COMMAND]]);
    expect(keyboard[PER_KEY_COMMAND]).toBe(sent);
  });

  test("clears the table with an empty list", async () => {
    const { device, keyboard } = fakeDevice({ [PER_KEY_COMMAND]: sent });

    await writePerKeyOverrides(device, []);

    expect(keyboard[PER_KEY_COMMAND]).toBe("0");
  });

  test("accepts the virtual keyboard's echo", async () => {
    const { device, keyboard } = virtualDevice();

    await writePerKeyOverrides(device, list);

    expect(keyboard[PER_KEY_COMMAND]).toBe(sent);
  });

  test("rejects an invalid table without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writePerKeyOverrides(device, [override(54, { mode: 1 })])).rejects.toThrow("not sent");
    await expect(writePerKeyOverrides(device, [override(3, { mode: 1 }), override(3, { retro: true })])).rejects.toThrow(
      "not sent",
    );
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects the firmware's error reply and reads the kept table back into the cache", async () => {
    const { device, noCacheCommand } = fakeDevice({ [PER_KEY_COMMAND]: "1 8 250 65535 255 3 3 3 3" }, true);

    await expect(writePerKeyOverrides(device, list)).rejects.toThrow("rejected");
    expect(noCacheCommand.mock.calls).toEqual([[PER_KEY_COMMAND, sent], [PER_KEY_COMMAND]]);
    expect(await noCacheCommand.mock.results[1].value).toBe("1 8 250 65535 255 3 3 3 3");
  });

  test("rejects an Error reply to the write", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(writePerKeyOverrides({ noCacheCommand }, list)).rejects.toThrow("timeout");
    expect(noCacheCommand.mock.calls).toEqual([[PER_KEY_COMMAND, sent], [PER_KEY_COMMAND]]);
  });

  test("rejects a read-back that differs from the table sent", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(writePerKeyOverrides({ noCacheCommand }, list)).rejects.toThrow("did not store");
  });
});

describe("restores", () => {
  test("write valid entries and read them back", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await restoreDualFunctionGlobals(device, " 1 1 1 1 120 1 109 ");
    await restorePerKeyOverrides(device, "1 8 250 65535 255 3 3 3 3");

    expect(noCacheCommand.mock.calls).toEqual([
      [DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"],
      [DUAL_FUNCTION_COMMAND],
      [PER_KEY_COMMAND, "1 8 250 65535 255 3 3 3 3"],
      [PER_KEY_COMMAND],
    ]);
  });

  test("send a hand-edited table in the keyboard's order", async () => {
    const { device, keyboard } = fakeDevice();

    await restorePerKeyOverrides(device, "2 40 65535 65535 255 1 3 3 3 7 65535 65535 255 3 3 3 3");

    expect(keyboard[PER_KEY_COMMAND]).toBe("1 40 65535 65535 255 1 3 3 3");
  });

  test.each([
    [DUAL_FUNCTION_COMMAND, "0 0 0 0 0 0 3", restoreDualFunctionGlobals],
    [DUAL_FUNCTION_COMMAND, "0 0 0 0 0 0", restoreDualFunctionGlobals],
    [PER_KEY_COMMAND, "1 52 65535 65535 255 1 3 3 3", restorePerKeyOverrides],
    [PER_KEY_COMMAND, "2 3 65535 65535 255 1 3 3 3", restorePerKeyOverrides],
  ])("reject the malformed %s entry %s without sending anything", async (_, data, restore) => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restore(device, data)).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

/* Keep the keyboard's options apart from a cache that stores every reply and every sent value, as Device.noCacheCommand does */
const cachingDevice = (initial: unknown) => {
  const keyboard = { options: initial };
  const memoryMap = new Map<string, unknown>();
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      keyboard.options = args.join(" ");
    }

    memoryMap.set(cmd, keyboard.options);
    return args.length > 0 ? "" : keyboard.options;
  });

  /* Answer from the cache, as Device.command does for the backup */
  const command = async (cmd: string) => memoryMap.get(cmd);
  return { device: { noCacheCommand }, keyboard, noCacheCommand, command };
};

describe("saveDualFunctionGlobals", () => {
  test("replaces a cached failed read with the keyboard's options before the backup", async () => {
    const { device, keyboard, command } = cachingDevice(new Error("timeout"));

    expect(await readDualFunctionGlobals(device)).toBeNull();
    expect(await command(DUAL_FUNCTION_COMMAND)).toBeInstanceOf(Error);

    keyboard.options = "2 0 0 0 0 0 0";
    await saveDualFunctionGlobals(device, null);

    expect(await command(DUAL_FUNCTION_COMMAND)).toBe("2 0 0 0 0 0 0");
  });

  test("throws when the options still cannot be read, so the save takes no backup", async () => {
    const { device, noCacheCommand } = cachingDevice(new Error("timeout"));

    await expect(saveDualFunctionGlobals(device, null)).rejects.toThrow("Could not read");
    expect(noCacheCommand.mock.calls).toEqual([[DUAL_FUNCTION_COMMAND]]);
  });

  test("writes options that were read and leaves them in the cache", async () => {
    const { device, keyboard, noCacheCommand, command } = cachingDevice("0 0 0 0 0 0 0");

    await saveDualFunctionGlobals(device, ALL_ON);

    expect(noCacheCommand.mock.calls).toEqual([[DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"], [DUAL_FUNCTION_COMMAND]]);
    expect(keyboard.options).toBe("1 1 1 1 120 1 109");
    expect(await command(DUAL_FUNCTION_COMMAND)).toBe("1 1 1 1 120 1 109");
  });
});
