import { describe, expect, test, vi } from "vitest";
import { SuperkeysType } from "@Renderer/types/superkeys";
import {
  DOMINANT_MAP_COMMAND,
  DOMINANT_TIMEOUT_COMMAND,
  DominantDevice,
  dominantAt,
  dominantRefusal,
  hasDominantCommands,
  isValidDominantTimeout,
  needsDominantClear,
  needsDominantTimeoutReset,
  parseDominantMap,
  parseDominantTimeout,
  readDominantMap,
  readDominantTimeout,
  restoreDominantMap,
  restoreDominantTimeout,
  saveDominantTimeout,
  serializeDominantMap,
  setDominant,
  writeDominantMap,
  writeDominantTimeout,
} from "./dominant";

/* Store each command's payload and reply with it, or reply `error` to every write when `reject` is set */
const fakeDevice = (initial: Record<string, string> = {}, reject = false) => {
  const keyboard: Record<string, string> = { [DOMINANT_MAP_COMMAND]: "0", [DOMINANT_TIMEOUT_COMMAND]: "60", ...initial };
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
  const device: DominantDevice = { noCacheCommand };
  return { device, keyboard, noCacheCommand };
};

const superkey = (actions: number[]): SuperkeysType => ({ actions, name: "", id: 0 });

/* Superkey slot 0 is a dual-function key with Layer Shift 2 on hold, slot 1 a multi-action key with no layer hold */
const SUPERKEYS = [superkey([5, 17451, 1, 1, 1]), superkey([5, 6, 7, 1, 1])];
const SUPERKEY_LAYER_HOLD = 53980;
const SUPERKEY_MULTI_ACTION = 53981;

describe("hasDominantCommands", () => {
  test("needs both command lines in help", () => {
    expect(hasDominantCommands("version\r\ndominant.map\r\ndominant.timeout\r\nhelp")).toBe(true);
    expect(hasDominantCommands("version\r\ndominant.map\r\nhelp")).toBe(false);
    expect(hasDominantCommands("version\r\ndominant.timeout\r\nhelp")).toBe(false);
    expect(hasDominantCommands("dominant.mapX\r\ndominant.timeout")).toBe(false);
    expect(hasDominantCommands(undefined)).toBe(false);
    expect(hasDominantCommands(new Error("timeout"))).toBe(false);
  });
});

describe("parseDominantMap and serializeDominantMap", () => {
  test("round-trips a map sorted by position", () => {
    const list = parseDominantMap("3 40 2 3 1 51 9");

    expect(list).toEqual([
      { position: 3, layer: 1 },
      { position: 40, layer: 2 },
      { position: 51, layer: 9 },
    ]);
    expect(serializeDominantMap(list!)).toBe("3 3 1 40 2 51 9");
  });

  test("reads the firmware's single-line reply", () => {
    expect(parseDominantMap("2 3 1 51 2\r\n")).toEqual([
      { position: 3, layer: 1 },
      { position: 51, layer: 2 },
    ]);
  });

  test("reads a reply split over several lines", () => {
    expect(parseDominantMap("2\r\n3 1\r\n51 2\r\n")).toEqual([
      { position: 3, layer: 1 },
      { position: 51, layer: 2 },
    ]);
  });

  test("reads and writes 0 for an empty map", () => {
    expect(parseDominantMap("0")).toEqual([]);
    expect(parseDominantMap(" 0\r\n")).toEqual([]);
    expect(serializeDominantMap([])).toBe("0");
  });

  test("sorts the output by position", () => {
    expect(
      serializeDominantMap([
        { position: 20, layer: 3 },
        { position: 1, layer: 2 },
      ]),
    ).toBe("2 1 2 20 3");
  });

  test.each([
    ["an odd number of tokens", "1 3"],
    ["a count above the pairs", "2 3 1"],
    ["a count below the pairs", "1 3 1 4 1"],
    ["position 52", "1 52 1"],
    ["position 55", "1 55 1"],
    ["position 60", "1 60 1"],
    ["layer 0", "1 3 0"],
    ["layer 10", "1 3 10"],
    ["a duplicate position", "2 3 1 3 2"],
    ["a non-numeric value", "1 3 a"],
    ["a negative value", "1 -3 1"],
    ["trailing tokens", "1 3 1 7"],
    ["an empty reply", ""],
    ["an Error", new Error("timeout")],
    ["undefined", undefined],
  ])("returns null for %s", (_, raw) => {
    expect(parseDominantMap(raw)).toBeNull();
  });
});

describe("setDominant and dominantAt", () => {
  test("sets, replaces and removes a position's layer", () => {
    const one = setDominant([], 20, 1);
    const two = setDominant(one, 3, 4);
    const replaced = setDominant(two, 20, 2);
    const removed = setDominant(replaced, 3, null);

    expect(two).toEqual([
      { position: 3, layer: 4 },
      { position: 20, layer: 1 },
    ]);
    expect(dominantAt(replaced, 20)).toBe(2);
    expect(removed).toEqual([{ position: 20, layer: 2 }]);
    expect(dominantAt(removed, 3)).toBeNull();
  });
});

describe("dominant timeout", () => {
  test.each([
    ["9", null],
    ["10", 10],
    ["250", 250],
    ["251", null],
    [" 60\r\n", 60],
    ["abc", null],
    ["", null],
    [undefined, null],
  ])("parses %j as %s", (raw, expected) => {
    expect(parseDominantTimeout(raw)).toBe(expected);
  });

  test.each([
    [9, false],
    [10, true],
    [250, true],
    [251, false],
    [60.5, false],
  ])("isValidDominantTimeout(%s) is %s", (value, expected) => {
    expect(isValidDominantTimeout(value)).toBe(expected);
  });
});

describe("needsDominantClear and needsDominantTimeoutReset", () => {
  const supported = new Set(["keymap.custom", DOMINANT_MAP_COMMAND, DOMINANT_TIMEOUT_COMMAND]);

  test("reset only when the keyboard lists the command and the original backup lacks it", () => {
    expect(needsDominantClear(["keymap.custom"], supported)).toBe(true);
    expect(needsDominantTimeoutReset(["keymap.custom"], supported)).toBe(true);
    expect(needsDominantClear(["keymap.custom", DOMINANT_MAP_COMMAND], supported)).toBe(false);
    expect(needsDominantTimeoutReset(["keymap.custom", DOMINANT_TIMEOUT_COMMAND], supported)).toBe(false);
    expect(needsDominantClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsDominantTimeoutReset(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
  });

  test("never reset with a null snapshot", () => {
    expect(needsDominantClear([], null)).toBe(false);
    expect(needsDominantTimeoutReset([], null)).toBe(false);
  });
});

describe("dominantRefusal", () => {
  test.each([
    ["Layer Shift 2", 17451],
    ["the first layer key", 17408],
    ["Layer Lock 1", 17492],
    ["a layer key in the range", 17483],
    ["OneShot layer 1", 49161],
    ["a dual-function layer key", 51218 + 256 + 4],
    ["a dual-function Superkey with a Layer Shift hold", SUPERKEY_LAYER_HOLD],
    ["a swap hands key", 54372],
  ])("refuses %s", (_, code) => {
    expect(dominantRefusal(code, SUPERKEYS)).toBe(true);
  });

  test.each([
    ["a letter", 21],
    ["a dual-function modifier key", 49169 + 4],
    ["a multi-action Superkey with no layer hold", SUPERKEY_MULTI_ACTION],
  ])("accepts %s", (_, code) => {
    expect(dominantRefusal(code, SUPERKEYS)).toBe(false);
  });
});

describe("readDominantMap and readDominantTimeout", () => {
  test("read the keyboard's values", async () => {
    const { device } = fakeDevice({ [DOMINANT_MAP_COMMAND]: "1 3 1", [DOMINANT_TIMEOUT_COMMAND]: "100" });

    expect(await readDominantMap(device)).toEqual([{ position: 3, layer: 1 }]);
    expect(await readDominantTimeout(device)).toBe(100);
  });

  test("return null on a failed read", async () => {
    const noCacheCommand = async () => {
      throw new Error("closed");
    };

    expect(await readDominantMap({ noCacheCommand })).toBeNull();
    expect(await readDominantTimeout({ noCacheCommand: async () => "error" })).toBeNull();
  });
});

describe("writeDominantMap", () => {
  test("writes the sorted map, then reads it back uncached", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeDominantMap(device, [
      { position: 20, layer: 1 },
      { position: 3, layer: 2 },
    ]);

    expect(noCacheCommand.mock.calls).toEqual([[DOMINANT_MAP_COMMAND, "2 3 2 20 1"], [DOMINANT_MAP_COMMAND]]);
  });

  test("throws on an error reply and refreshes the cache", async () => {
    const { device, noCacheCommand } = fakeDevice({}, true);

    await expect(writeDominantMap(device, [{ position: 3, layer: 1 }])).rejects.toThrow("rejected");
    expect(noCacheCommand.mock.calls).toEqual([[DOMINANT_MAP_COMMAND, "1 3 1"], [DOMINANT_MAP_COMMAND]]);
  });

  test("throws when the read-back differs", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(writeDominantMap({ noCacheCommand }, [{ position: 3, layer: 1 }])).rejects.toThrow("did not store");
  });

  test("refreshes the cache when the read-back fails", async () => {
    let reads = 0;
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => {
      if (args.length > 0) {
        return "";
      }

      reads += 1;
      return reads === 1 ? new Error("timeout") : "0";
    });

    await expect(writeDominantMap({ noCacheCommand }, [{ position: 3, layer: 1 }])).rejects.toThrow("timeout");
    expect(noCacheCommand.mock.calls).toEqual([[DOMINANT_MAP_COMMAND, "1 3 1"], [DOMINANT_MAP_COMMAND], [DOMINANT_MAP_COMMAND]]);
  });

  test("rejects an invalid map without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeDominantMap(device, [{ position: 52, layer: 1 }])).rejects.toThrow("not sent");
    await expect(writeDominantMap(device, [{ position: 3, layer: 0 }])).rejects.toThrow("not sent");
    await expect(
      writeDominantMap(device, [
        { position: 3, layer: 1 },
        { position: 3, layer: 2 },
      ]),
    ).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

describe("writeDominantTimeout", () => {
  test("writes the timeout, then reads it back uncached", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeDominantTimeout(device, 120);

    expect(noCacheCommand.mock.calls).toEqual([[DOMINANT_TIMEOUT_COMMAND, "120"], [DOMINANT_TIMEOUT_COMMAND]]);
  });

  test("throws on an error reply", async () => {
    const { device } = fakeDevice({}, true);

    await expect(writeDominantTimeout(device, 120)).rejects.toThrow("rejected");
  });

  test("rejects a timeout out of range without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeDominantTimeout(device, 9)).rejects.toThrow("not sent");
    await expect(writeDominantTimeout(device, 251)).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});

describe("restore and save", () => {
  test("restore the backup entries", async () => {
    const { device, keyboard } = fakeDevice();

    await restoreDominantMap(device, "1 51 1");
    await restoreDominantTimeout(device, "80");

    expect(keyboard[DOMINANT_MAP_COMMAND]).toBe("1 51 1");
    expect(keyboard[DOMINANT_TIMEOUT_COMMAND]).toBe("80");
  });

  test("throw on a malformed entry without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreDominantMap(device, "1 52 1")).rejects.toThrow("Malformed");
    await expect(restoreDominantTimeout(device, "5")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("saveDominantTimeout writes a read timeout and reads again after a failed read", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await saveDominantTimeout(device, 90);
    await saveDominantTimeout(device, -1);

    expect(noCacheCommand.mock.calls).toEqual([
      [DOMINANT_TIMEOUT_COMMAND, "90"],
      [DOMINANT_TIMEOUT_COMMAND],
      [DOMINANT_TIMEOUT_COMMAND],
    ]);
  });

  test("saveDominantTimeout throws when the timeout still cannot be read", async () => {
    await expect(saveDominantTimeout({ noCacheCommand: async () => "" }, -1)).rejects.toThrow("Could not read");
  });
});
