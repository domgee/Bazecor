import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { SuperkeysType } from "@Renderer/types/superkeys";
import {
  ALT_REPEAT_COMMAND,
  ALT_REPEAT_REPEAT_FLAG,
  AltRepeatDevice,
  altRepeatDefaultBlock,
  basePrevious,
  clearLayerRules,
  copyLayerRules,
  decodeDualUse,
  dualUseCodeFor,
  findKeyType,
  hasAltRepeatCommand,
  hasRepeat,
  isAllowedOutput,
  isDualFunctionSuperkey,
  isValidPrevious,
  needsAltRepeatClear,
  normalizePrevious,
  parseAltRepeatRaw,
  previousModifiers,
  readAltRepeatRules,
  remapMacroOutputs,
  remapSuperkeyOutputs,
  replaceAllRules,
  replaceLayerRules,
  replacesTap,
  restoreAltRepeat,
  rulesAt,
  rulesUsingOutput,
  serializeAltRepeat,
  superkeyQukeyCode,
  validateAltRepeatRules,
  withRepeat,
  writeAltRepeatRules,
} from "./altRepeat";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const rule = (layer: number, position: number, previous: number, output: number): AltRepeatRule => ({
  layer,
  position,
  previous,
  output,
});

const superkey = (actions: number[]): SuperkeysType => ({ actions, name: "", id: 0 });

const fill = (count: number, layer = 0): AltRepeatRule[] =>
  Array.from({ length: count }, (_, i) => rule(layer, i % 60, 4 + Math.floor(i / 60), 5));

/* A keyboard that stores what it is sent, or keeps its table when `reject` is set */
const fakeDevice = (initial = "0", reject = false) => {
  let table = initial;
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (cmd !== ALT_REPEAT_COMMAND) {
      return "";
    }

    if (args.length > 0) {
      if (!reject) {
        table = args.join(" ");
      }

      return "";
    }

    return table;
  });
  const device: AltRepeatDevice = { noCacheCommand };
  return { device, noCacheCommand };
};

describe("parseAltRepeatRaw", () => {
  test("reads an empty table", () => {
    expect(parseAltRepeatRaw("0")).toEqual([]);
  });

  test("reads rules in firmware order, with the firmware's trailing space", () => {
    expect(parseAltRepeatRaw("2 0 23 6 14 0 23 4102 27 ")).toEqual([rule(0, 23, 6, 14), rule(0, 23, 4102, 27)]);
  });

  test.each([[""], ["1 0 1"], ["x"], ["2 0 23 6 14"], ["1 0 1 2 70000"], ["129"], [undefined], [new Error("timeout")]])(
    "rejects %s",
    raw => {
      expect(parseAltRepeatRaw(raw)).toBeNull();
    },
  );
});

describe("serializeAltRepeat", () => {
  test("sorts by layer, then position, and keeps the order within a key", () => {
    const rules = [rule(1, 2, 6, 4), rule(0, 23, 7, 5), rule(0, 5, 8, 6), rule(0, 23, 6, 7)];

    expect(serializeAltRepeat(rules)).toBe("4 0 5 8 6 0 23 7 5 0 23 6 7 1 2 6 4");
  });

  test("writes an empty table as 0", () => {
    expect(serializeAltRepeat([])).toBe("0");
  });

  test("round trips", () => {
    const raw = "3 0 5 8 6 0 23 7 5 1 2 6 4";

    expect(serializeAltRepeat(parseAltRepeatRaw(raw))).toBe(raw);
  });
});

describe("previous key", () => {
  test.each([
    [0x406, 0x206],
    [0x506, 0x306],
    [0x106, 0x106],
  ])("normalizePrevious(%i) is %i", (code, expected) => {
    expect(normalizePrevious(code)).toBe(expected);
  });

  test.each([[0x06], [0x1006], [0x1b06], [0xdd]])("%i is a valid previous key", code => {
    expect(isValidPrevious(code)).toBe(true);
  });

  test.each([[0], [0x03], [0xe0], [0x10e3], [0x2006], [0x406], [0xde], [17450], [65535]])("%i is not a previous key", code => {
    expect(isValidPrevious(code)).toBe(false);
  });

  test.each([[0x8006], [0x9006], [0x9b06], [0x80dd]])("%i with the repeat flag is a valid previous key", code => {
    expect(isValidPrevious(code)).toBe(true);
  });

  test.each([[0x8000], [0x80e0], [0xa006], [0x8406], [0x10006]])("%i with the repeat flag is not a previous key", code => {
    expect(isValidPrevious(code)).toBe(false);
  });

  test("normalizePrevious keeps the repeat flag", () => {
    expect(normalizePrevious(0x8406)).toBe(0x8206);
  });

  test("previousModifiers ignores the repeat flag", () => {
    expect(previousModifiers(0x9006)).toEqual(["gui"]);
  });

  test("repeat helpers set, clear and strip the flag", () => {
    expect(ALT_REPEAT_REPEAT_FLAG).toBe(0x8000);
    expect(hasRepeat(0x9035)).toBe(true);
    expect(hasRepeat(0x1035)).toBe(false);
    expect(withRepeat(0x1035, true)).toBe(0x9035);
    expect(withRepeat(0x9035, true)).toBe(0x9035);
    expect(withRepeat(0x9035, false)).toBe(0x1035);
    expect(basePrevious(0x9035)).toBe(0x1035);
    expect(basePrevious(0x1035)).toBe(0x1035);
  });

  test("previousModifiers lists Ctrl, Alt, Shift and Gui", () => {
    expect(previousModifiers(0x1b06)).toEqual(["ctrl", "alt", "shift", "gui"]);
    expect(previousModifiers(0x406)).toEqual(["alt"]);
    expect(previousModifiers(6)).toEqual([]);
  });
});

describe("isAllowedOutput", () => {
  test.each([[4], [0x1006], [17450], [53852], [53980], [54371]])("%i is allowed", code => {
    expect(isAllowedOutput(code)).toBe(true);
  });

  test.each([[0], [65535], [49169], [53266], [54115], [54370]])("%i is not allowed", code => {
    expect(isAllowedOutput(code)).toBe(false);
  });

  test.each([
    [54372], // Swap while held
    [54420], // Swap hands, Space on tap
    [54631], // Last swap hands tap code
  ])("swap hands key %i is not allowed", code => {
    expect(isAllowedOutput(code)).toBe(false);
  });

  /* Mirror the shape LayerHoldMods registers, a modifier and a keycode from a to the last HID key */
  test.each([
    [0x302b], // Cmd+Tab held until layer change
    [0x2404], // AltGr+a
    [0x3fdd], // all modifiers with the last HID key
  ])("layer hold code %i is allowed", code => {
    expect(isAllowedOutput(code)).toBe(true);
  });

  test.each([
    [0x2006], // no modifier
    [0x3003], // keycode below a
    [0x30e3], // modifier-only keycode Gui
    [0x30de], // keycode above the last HID key
    [0x3fff], // keycode 0xff
  ])("layer hold code %i is not allowed", code => {
    expect(isAllowedOutput(code)).toBe(false);
  });

  /* Mirror LayerHoldModsDygma::partialShape. A code without a table entry still plays, as the plain shortcut */
  test.each([
    [0x982b], // Cmd+Shift+Tab, slot 0
    [0xb82b], // Cmd+Shift+Tab, slot 1
    [0x9fdd], // all modifiers with the last HID key
  ])("partial hold code %i is allowed", code => {
    expect(isAllowedOutput(code)).toBe(true);
  });

  test.each([
    [0x902b], // a single modifier
    [0x802b], // no modifier
    [0x9803], // keycode below a
    [0x98de], // keycode above the last HID key
  ])("partial hold code %i is not allowed", code => {
    expect(isAllowedOutput(code)).toBe(false);
  });
});

describe("validateAltRepeatRules", () => {
  test("accepts valid rules, also the same previous key on another key", () => {
    expect(validateAltRepeatRules([rule(0, 1, 6, 4), rule(0, 2, 6, 4), rule(9, 59, 0x1006, 53980)], 10, 60)).toBeNull();
  });

  test("accepts a rule with the repeat flag", () => {
    expect(validateAltRepeatRules([rule(0, 1, 0x9035, 0x1035), rule(0, 1, 6, 4)], 10, 60)).toBeNull();
  });

  test.each([
    ["129 rules", fill(129)],
    ["a layer at the count", [rule(10, 0, 6, 4)]],
    ["a position at the key count", [rule(0, 60, 6, 4)]],
    ["a modifier-only previous key", [rule(0, 1, 0xe0, 4)]],
    ["a Transparent output", [rule(0, 1, 6, 65535)]],
    ["a repeated previous key on one key", [rule(0, 1, 6, 4), rule(0, 1, 6, 5)]],
    ["the same previous key with and without the repeat flag", [rule(0, 1, 6, 4), rule(0, 1, 0x8006, 5)]],
  ])("rejects %s", (_, rules) => {
    expect(validateAltRepeatRules(rules, 10, 60)).not.toBeNull();
  });
});

describe("rulesAt", () => {
  test("lists a key's rules in order", () => {
    const rules = [rule(0, 1, 6, 4), rule(1, 1, 6, 4), rule(0, 1, 7, 4), rule(0, 2, 6, 4)];

    expect(rulesAt(rules, 0, 1)).toEqual([0, 2]);
    expect(rulesAt(rules, 1, 2)).toEqual([]);
  });
});

describe("Superkey conversion mirror", () => {
  test.each([
    [17450, 5],
    [17459, 5],
    [300, 3],
    [7935, 3],
    [23785, 6],
    [17492, -1],
    [224, -1],
    [6, -1],
    [17153, -1],
    [53900, -1],
  ])("findKeyType(%i) is %i", (value, expected) => {
    expect(findKeyType(value)).toBe(expected);
  });

  test.each([
    [6, 224, 49175],
    [6, 0x1e1, 49169 + 5 * 256 + 6],
    [0x1006, 224, 49169 + 128 + 6],
    [6, 17450, 51224],
    [6, 17457, 51218 + 7 * 256 + 6],
    [6, 17458, 53272],
    [6, 17459, 53528],
    [6, 7, 0],
  ])("superkeyQukeyCode(%i, %i) is %i", (tap, hold, expected) => {
    expect(superkeyQukeyCode(tap, hold)).toBe(expected);
  });

  test.each([[[6, 224]], [[6, 224, 0, 0, 0]], [[6, 17450]], [[6, 17457, 1, 1, 1]], [[0x1006, 0x1e1]]])(
    "%j is a dual-function Superkey",
    actions => {
      expect(isDualFunctionSuperkey(superkey(actions))).toBe(true);
    },
  );

  test.each([
    [[6, 17458]], // Layer Shift 8 lands outside the dual-function range
    [[6, 17459]], // Layer Shift 9
    [[6, 17492]], // Lock layer hold
    [[17492, 224]], // Lock layer tap
    [[225, 224]], // Modifier tap
    [[0x10e1, 224]], // Modifier tap with a flag
    [[6, 7]], // Hold is neither a modifier nor a layer shift
    [[6, 224, 65535, 1, 1]], // 65535 is not idle
    [[6, 224, 4]], // A third action
    [[0, 224]], // Idle tap
  ])("%j is not a dual-function Superkey", actions => {
    expect(isDualFunctionSuperkey(superkey(actions))).toBe(false);
  });

  test("a missing Superkey is not dual-function", () => {
    expect(isDualFunctionSuperkey(undefined)).toBe(false);
  });
});

describe("altRepeatDefaultBlock", () => {
  test.each([
    [65535, "transparent"],
    [54115, "autoshift"],
    [54371, "capsword"],
    [53267, "unsupported"],
    [53272, "unsupported"],
    [53851, "unsupported"],
    [54372, "swaphands"],
    [54420, "swaphands"],
  ])("%i is blocked as %s", (code, expected) => {
    expect(altRepeatDefaultBlock(code)).toBe(expected);
  });

  test("a Superkey that stays a Superkey is blocked", () => {
    expect(altRepeatDefaultBlock(53980, [superkey([6, 17458])])).toBe("superkey");
  });

  test("a Superkey the firmware stores as dual-function is not", () => {
    expect(altRepeatDefaultBlock(53980, [superkey([6, 224])])).toBeNull();
  });

  test.each([[0], [4], [49169], [53266], [0x3006]])("%i is not blocked", code => {
    expect(altRepeatDefaultBlock(code)).toBeNull();
  });

  test("replacesTap is true for dual-function keys and Superkeys", () => {
    expect(replacesTap(49175)).toBe(true);
    expect(replacesTap(53980, [superkey([6, 224])])).toBe(true);
    expect(replacesTap(4)).toBe(false);
    expect(replacesTap(53980, [superkey([6, 17458])])).toBe(false);
  });
});

describe("table operations", () => {
  test("clearLayerRules drops a layer's rules, or only some positions", () => {
    const rules = [rule(0, 1, 6, 4), rule(0, 2, 6, 4), rule(1, 1, 6, 4)];

    expect(clearLayerRules(rules, 0)).toEqual([rule(1, 1, 6, 4)]);
    expect(clearLayerRules(rules, 0, new Set([2]))).toEqual([rule(0, 1, 6, 4), rule(1, 1, 6, 4)]);
  });

  test("copyLayerRules gives the target the source's rules", () => {
    const rules = [rule(0, 1, 6, 4), rule(1, 2, 7, 5)];

    expect(copyLayerRules(rules, 0, 1)).toEqual({ rules: [rule(0, 1, 6, 4), rule(1, 1, 6, 4)] });
  });

  test("copyLayerRules from a layer without rules of its own clears the target", () => {
    const rules = [rule(0, 1, 6, 4), rule(1, 2, 7, 5)];

    expect(copyLayerRules(rules, null, 1)).toEqual({ rules: [rule(0, 1, 6, 4)] });
  });

  test("copyLayerRules refuses to go past capacity and leaves the input alone", () => {
    const rules = fill(100, 0).concat(fill(10, 1));
    const before = JSON.stringify(rules);

    expect(copyLayerRules(rules, 0, 1)).toEqual({ error: "capacity" });
    expect(JSON.stringify(rules)).toBe(before);
  });

  test("replaceLayerRules folds AltGr into Alt and drops invalid and repeated entries", () => {
    const rules = [rule(0, 1, 6, 4), rule(1, 1, 6, 4)];
    const entries = [
      { position: 3, previous: 0x406, output: 5 },
      { position: 3, previous: 0x206, output: 6 },
      { position: 70, previous: 6, output: 5 },
      { position: 4, previous: 0xe0, output: 5 },
      { position: 5, previous: 6, output: 65535 },
      null,
    ];

    expect(replaceLayerRules(rules, 0, entries, 60)).toEqual({ rules: [rule(1, 1, 6, 4), rule(0, 3, 0x206, 5)], dropped: 5 });
  });

  test("replaceLayerRules keeps the repeat flag and drops a later entry that differs only in it", () => {
    const entries = [
      { position: 3, previous: 0x8406, output: 5 },
      { position: 3, previous: 0x206, output: 6 },
    ];

    expect(replaceLayerRules([], 0, entries, 60)).toEqual({ rules: [rule(0, 3, 0x8206, 5)], dropped: 1 });
  });

  test("replaceLayerRules drops the repeat flag for firmware without it", () => {
    const entries = [
      { position: 3, previous: 0x8406, output: 5 },
      { position: 4, previous: 0x9006, output: 6 },
      { position: 4, previous: 0x1006, output: 7 },
    ];

    expect(replaceLayerRules([], 0, entries, 60, false)).toEqual({
      rules: [rule(0, 3, 0x206, 5), rule(0, 4, 0x1006, 6)],
      dropped: 1,
    });
  });

  test("replaceLayerRules refuses to go past capacity and leaves the input alone", () => {
    const rules = fill(120, 1);
    const entries = fill(10, 0).map(({ position, previous, output }) => ({ position, previous, output }));

    expect(replaceLayerRules(rules, 0, entries, 60)).toEqual({ error: "capacity" });
    expect(rules).toHaveLength(120);
  });

  test("replaceAllRules drops a later rule that differs only in the repeat flag", () => {
    expect(replaceAllRules([rule(0, 1, 6, 4), rule(0, 1, 0x8006, 5)], 10, 60)).toEqual({ rules: [rule(0, 1, 6, 4)], dropped: 1 });
  });

  test("replaceAllRules drops the repeat flag for firmware without it and keeps it otherwise", () => {
    const entries = [rule(0, 1, 0x8006, 4), rule(1, 2, 7, 5)];

    expect(replaceAllRules(entries, 10, 60, false)).toEqual({ rules: [rule(0, 1, 6, 4), rule(1, 2, 7, 5)], dropped: 0 });
    expect(replaceAllRules(entries, 10, 60, true)).toEqual({ rules: entries, dropped: 0 });
  });

  test("replaceAllRules keeps valid rules and refuses more than capacity", () => {
    expect(replaceAllRules([rule(0, 1, 6, 4), rule(12, 1, 6, 4)], 10, 60)).toEqual({ rules: [rule(0, 1, 6, 4)], dropped: 1 });
    expect(replaceAllRules(fill(129), 10, 60)).toEqual({ error: "capacity" });
  });
});

describe("macro and Superkey deletion", () => {
  test("remapMacroOutputs drops rules on a deleted macro without replacement and moves higher macros down", () => {
    const rules = [rule(0, 1, 6, 53854), rule(0, 2, 6, 53855), rule(0, 3, 6, 53853), rule(0, 4, 6, 4)];

    expect(remapMacroOutputs(rules, 2, -1)).toEqual([rule(0, 2, 6, 53854), rule(0, 3, 6, 53853), rule(0, 4, 6, 4)]);
  });

  test("remapMacroOutputs moves rules on a deleted macro to the replacement", () => {
    expect(remapMacroOutputs([rule(0, 1, 6, 53854)], 2, 0)).toEqual([rule(0, 1, 6, 53852)]);
  });

  test("remapSuperkeyOutputs drops rules on the deleted Superkey and moves higher ones down", () => {
    const rules = [rule(0, 1, 6, 53981), rule(0, 2, 6, 53982), rule(0, 3, 6, 53980)];

    expect(remapSuperkeyOutputs(rules, 1)).toEqual([rule(0, 2, 6, 53981), rule(0, 3, 6, 53980)]);
  });

  test("rulesUsingOutput counts the rules with that output", () => {
    expect(rulesUsingOutput([rule(0, 1, 6, 53852), rule(0, 2, 6, 53852), rule(0, 3, 6, 4)], 53852)).toBe(2);
  });
});

describe("capability and restore helpers", () => {
  test("hasAltRepeatCommand finds the command line in help", () => {
    expect(hasAltRepeatCommand("version\r\naltrepeat.map\r\nhelp")).toBe(true);
    expect(hasAltRepeatCommand("altrepeat.mapX")).toBe(false);
    expect(hasAltRepeatCommand("")).toBe(false);
    expect(hasAltRepeatCommand(undefined)).toBe(false);
    expect(hasAltRepeatCommand(new Error("timeout"))).toBe(false);
  });

  test("needsAltRepeatClear only when the keyboard has the command and the backup lacks it", () => {
    const supported = new Set(["keymap.custom", ALT_REPEAT_COMMAND]);

    expect(needsAltRepeatClear(["keymap.custom"], supported)).toBe(true);
    expect(needsAltRepeatClear(["keymap.custom", ALT_REPEAT_COMMAND], supported)).toBe(false);
    expect(needsAltRepeatClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsAltRepeatClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("readAltRepeatRules", () => {
  test("reads the table", async () => {
    const { device } = fakeDevice("1 0 23 6 14");

    expect(await readAltRepeatRules(device)).toEqual([rule(0, 23, 6, 14)]);
  });

  test("returns null on an Error reply or a thrown error", async () => {
    expect(await readAltRepeatRules({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(
      await readAltRepeatRules({
        noCacheCommand: async () => {
          throw new Error("closed");
        },
      }),
    ).toBeNull();
  });
});

describe("writeAltRepeatRules", () => {
  test("writes the serialisation, then reads it back", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeAltRepeatRules(device, [rule(0, 23, 4102, 27), rule(0, 5, 6, 14)], 10, 60);

    expect(noCacheCommand.mock.calls).toEqual([[ALT_REPEAT_COMMAND, "2 0 5 6 14 0 23 4102 27"], [ALT_REPEAT_COMMAND]]);
  });

  test("sends 0 for an empty table", async () => {
    const { device, noCacheCommand } = fakeDevice("1 0 23 6 14");

    await writeAltRepeatRules(device, [], 0, 0);

    expect(noCacheCommand.mock.calls[0]).toEqual([ALT_REPEAT_COMMAND, "0"]);
  });

  test("rejects invalid rules without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeAltRepeatRules(device, [rule(0, 1, 0xe0, 4)], 10, 60)).rejects.toThrow();
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard keeps its old table", async () => {
    const { device } = fakeDevice("0", true);

    await expect(writeAltRepeatRules(device, [rule(0, 1, 6, 4), rule(0, 2, 6, 4)], 10, 60)).rejects.toThrow();
  });

  test("rejects an Error reply", async () => {
    const device: AltRepeatDevice = { noCacheCommand: async () => new Error("timeout") };

    await expect(writeAltRepeatRules(device, [], 0, 0)).rejects.toThrow("timeout");
  });

  test("rejects a thrown transport error", async () => {
    const device: AltRepeatDevice = {
      noCacheCommand: async () => {
        throw new Error("port closed");
      },
    };

    await expect(writeAltRepeatRules(device, [], 0, 0)).rejects.toThrow("port closed");
  });

  test("rejects a different table read back", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "1 0 1 6 5"),
    );

    await expect(writeAltRepeatRules({ noCacheCommand }, [rule(0, 1, 6, 4)], 10, 60)).rejects.toThrow();
  });

  test("rejects a reply that is not a string", async () => {
    const noCacheCommand = vi.fn(async (): Promise<unknown> => undefined);

    await expect(writeAltRepeatRules({ noCacheCommand }, [], 0, 0)).rejects.toThrow();
  });
});

describe("restoreAltRepeat", () => {
  test("writes a valid backup entry", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await restoreAltRepeat(device, "1 9 23 6 14", 60);

    expect(noCacheCommand.mock.calls[0]).toEqual([ALT_REPEAT_COMMAND, "1 9 23 6 14"]);
  });

  test("rejects malformed data without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreAltRepeat(device, "[object Object]", 60)).rejects.toThrow();
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard refuses the table", async () => {
    const { device } = fakeDevice("0", true);

    await expect(restoreAltRepeat(device, "1 0 23 6 14", 60)).rejects.toThrow();
  });
});

describe("native dual-use codes", () => {
  test.each([
    [0x04, 0xe0, 49169 + 4],
    [0x7f, 0xe0, 49169 + 0x7f],
    [0x04, 0xe1, 49425 + 4],
    [0x04, 0xe2, 49681 + 4],
    [0x04, 0xe3, 49937 + 4],
    [0x04, 0xe6, 50705 + 4],
    [0x04, 17450, 51218 + 4],
    [0x04, 17457, 51218 + 7 * 256 + 4],
  ])("dualUseCodeFor(%i, %i) is %i", (tap, hold, expected) => {
    expect(dualUseCodeFor(tap, hold)).toBe(expected);
  });

  test.each([
    [0x03, 0xe0], // Below the first typing key
    [0x80, 0xe0], // Past the taps a DU code carries
    [0x104, 0xe0], // A tap with a modifier flag
    [0x04, 0xe4], // Right Ctrl
    [0x04, 0xe5], // Right Shift
    [0x04, 0xe7], // Right GUI
    [0x04, 0x1e0], // A hold with the right-side flag
    [0x04, 17458], // Layer Shift 8
    [0x04, 17492], // Lock layer
    [0x04, 0x05], // Not a modifier
  ])("dualUseCodeFor(%i, %i) is null", (tap, hold) => {
    expect(dualUseCodeFor(tap, hold)).toBeNull();
  });

  test.each([
    [0x04, 0xe0],
    [0x7f, 0xe3],
    [0x2c, 0xe6],
    [0x04, 17450],
    [0x7f, 17457],
  ])("decodeDualUse inverts dualUseCodeFor(%i, %i) and agrees with superkeyQukeyCode", (tap, hold) => {
    const code = dualUseCodeFor(tap, hold) as number;

    expect(decodeDualUse(code)).toEqual({ tap, hold });
    expect(superkeyQukeyCode(tap, hold)).toBe(code);
  });

  test.each([[49168], [53267], [49169], [51217], [51218], [53266]])("decodeDualUse(%i) is null", code => {
    expect(decodeDualUse(code)).toBeNull();
  });
});
