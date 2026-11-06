import { describe, expect, test, vi } from "vitest";
import { ConditionalLayerRule } from "@Renderer/types/conditionalLayers";
import { KEY_OVERRIDES_COMMAND, needsKeyOverridesClear } from "./keyOverrides";
import {
  CONDITIONAL_LAYERS_COMMAND,
  ConditionalLayersDevice,
  MAX_CONDITIONAL_LAYERS,
  duplicateOf,
  hasConditionalLayersCommand,
  layerBits,
  needsConditionalLayersClear,
  newConditionalLayer,
  parseConditionalLayersRaw,
  readConditionalLayers,
  restoreConditionalLayers,
  serializeConditionalLayers,
  thenLayerOptions,
  toggleIfLayer,
  validateConditionalLayer,
  validateConditionalLayers,
  writeConditionalLayers,
} from "./conditionalLayers";

/* Firmware layers 1 and 2 turn on layer 3, Bazecor's 2 and 3 turn on 4 */
const tri: ConditionalLayerRule = { ifMask: 6, thenLayer: 3 };

/* Firmware layers 1 and 3 turn on layer 4 */
const chain: ConditionalLayerRule = { ifMask: 10, thenLayer: 4 };

/* Rules on layers 0 and 1, each with its own then-layer */
const fill = (count: number): ConditionalLayerRule[] =>
  Array.from({ length: count }, (_, i) => ({ ifMask: 3, thenLayer: 2 + i }));

/* A keyboard that stores what it is sent, or keeps its table and replies `error` when `reject` is set */
const fakeDevice = (initial = "0", reject = false) => {
  let table = initial;
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (cmd !== CONDITIONAL_LAYERS_COMMAND) {
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
  const device: ConditionalLayersDevice = { noCacheCommand };
  return { device, noCacheCommand };
};

describe("hasConditionalLayersCommand", () => {
  test("finds the exact line, also with CRLF", () => {
    expect(hasConditionalLayersCommand("keymap.custom\nconditional.map\nversion")).toBe(true);
    expect(hasConditionalLayersCommand("keymap.custom\r\nconditional.map\r\nversion")).toBe(true);
    expect(hasConditionalLayersCommand("  conditional.map  ")).toBe(true);
  });

  test("ignores a longer command and a reply that is not a string", () => {
    expect(hasConditionalLayersCommand("conditional.mapx\nkeymap.custom")).toBe(false);
    expect(hasConditionalLayersCommand("")).toBe(false);
    expect(hasConditionalLayersCommand(undefined)).toBe(false);
    expect(hasConditionalLayersCommand(new Error("timeout"))).toBe(false);
  });
});

describe("parseConditionalLayersRaw", () => {
  test("reads the empty table, one rule and eight rules", () => {
    expect(parseConditionalLayersRaw("0")).toEqual([]);
    expect(parseConditionalLayersRaw("1 6 3")).toEqual([tri]);
    expect(parseConditionalLayersRaw(" 2 6 3\r\n10 4 ")).toEqual([tri, chain]);
    expect(parseConditionalLayersRaw(serializeConditionalLayers(fill(8)))).toEqual(fill(8));
  });

  test.each([
    ["nine rules", serializeConditionalLayers(fill(9))],
    ["too few tokens", "2 6 3"],
    ["an extra token", "1 6 3 0"],
    ["a non-digit", "1 6 x"],
    ["a negative value", "1 -1 3"],
    ["a value above 0xffff", "1 65536 3"],
    ["a then-layer above a byte", "1 6 256"],
    ["an empty reply", ""],
    ["a blank reply", "   "],
  ])("returns null for %s", (_, raw) => {
    expect(parseConditionalLayersRaw(raw)).toBeNull();
  });

  test("returns null for a reply that is not a string", () => {
    expect(parseConditionalLayersRaw(new Error("timeout"))).toBeNull();
    expect(parseConditionalLayersRaw(undefined)).toBeNull();
  });
});

describe("serializeConditionalLayers", () => {
  test("writes the count, then ifMask and thenLayer per rule in list order", () => {
    expect(serializeConditionalLayers([tri, chain])).toBe("2 6 3 10 4");
    expect(serializeConditionalLayers([])).toBe("0");
  });

  test("round trips through the parser", () => {
    const list = [tri, chain, { ifMask: 0x1ff, thenLayer: 9 }];

    expect(parseConditionalLayersRaw(serializeConditionalLayers(list))).toEqual(list);
  });
});

describe("validateConditionalLayer", () => {
  test.each([
    ["two if-layers", tri],
    ["then-layer 0", { ifMask: 6, thenLayer: 0 }],
    ["nine if-layers and then-layer 9", { ifMask: 0x1ff, thenLayer: 9 }],
  ])("accepts %s", (_, rule) => {
    expect(validateConditionalLayer(rule)).toBeNull();
  });

  test.each([
    ["every layer as an if-layer, then 0", { ifMask: 0x3ff, thenLayer: 0 }],
    ["every layer as an if-layer, then 9", { ifMask: 0x3ff, thenLayer: 9 }],
    ["a layer above 10", { ifMask: 0x400, thenLayer: 0 }],
    ["a layer above 10 beside two valid ones", { ifMask: 0x406, thenLayer: 0 }],
    ["one if-layer", { ifMask: 2, thenLayer: 3 }],
    ["no if-layer", { ifMask: 0, thenLayer: 3 }],
    ["then-layer 10", { ifMask: 6, thenLayer: 10 }],
    ["a negative then-layer", { ifMask: 6, thenLayer: -1 }],
    ["the then-layer among the if-layers", { ifMask: 6, thenLayer: 1 }],
    ["a fractional then-layer", { ifMask: 6, thenLayer: 1.5 }],
    ["a fractional if-layer mask", { ifMask: 6.5, thenLayer: 3 }],
    ["a negative if-layer mask", { ifMask: -1, thenLayer: 3 }],
    ["an if-layer mask above 32 bits", { ifMask: 2 ** 32 + 6, thenLayer: 3 }],
  ])("rejects %s", (_, rule) => {
    expect(validateConditionalLayer(rule)).not.toBeNull();
  });
});

describe("validateConditionalLayers", () => {
  test("accepts eight rules, one mask with different then-layers and one then-layer with different masks", () => {
    expect(validateConditionalLayers(fill(8))).toBeNull();
    expect(validateConditionalLayers([tri, { ifMask: 6, thenLayer: 4 }])).toBeNull();
    expect(validateConditionalLayers([tri, { ifMask: 0x12, thenLayer: 3 }])).toBeNull();
    expect(validateConditionalLayers([])).toBeNull();
  });

  test("rejects nine rules, an exact duplicate and an invalid rule", () => {
    expect(validateConditionalLayers(fill(9))).not.toBeNull();
    expect(validateConditionalLayers([tri, chain, { ...tri }])).toBe("rule 2: repeats rule 0");
    expect(validateConditionalLayers([tri, { ifMask: 2, thenLayer: 3 }])).toMatch(/^rule 1: /);
  });

  test("the limit is the firmware's 8", () => {
    expect(MAX_CONDITIONAL_LAYERS).toBe(8);
  });
});

describe("list helpers", () => {
  test("layerBits counts the layers in a mask", () => {
    expect(layerBits(0)).toBe(0);
    expect(layerBits(6)).toBe(2);
    expect(layerBits(0x3ff)).toBe(10);
  });

  test("a new rule turns on Bazecor's layer 4 from 2 and 3, and is valid", () => {
    expect(newConditionalLayer()).toEqual({ ifMask: 6, thenLayer: 3 });
    expect(validateConditionalLayer(newConditionalLayer())).toBeNull();
  });

  test("toggleIfLayer adds and removes an if-layer", () => {
    expect(toggleIfLayer(tri, 0)).toEqual({ ifMask: 7, thenLayer: 3 });
    expect(toggleIfLayer({ ifMask: 7, thenLayer: 3 }, 1)).toEqual({ ifMask: 5, thenLayer: 3 });
  });

  test("toggleIfLayer keeps the rule for the then-layer, a layer out of range and the second-to-last if-layer", () => {
    expect(toggleIfLayer(tri, 3)).toBe(tri);
    expect(toggleIfLayer(tri, 10)).toBe(tri);
    expect(toggleIfLayer(tri, -1)).toBe(tri);
    expect(toggleIfLayer(tri, 1)).toBe(tri);
  });

  test("thenLayerOptions offers every layer but the if-layers", () => {
    expect(thenLayerOptions(tri)).toEqual([0, 3, 4, 5, 6, 7, 8, 9]);
    expect(thenLayerOptions({ ifMask: 0x1ff, thenLayer: 9 })).toEqual([9]);
  });

  test("duplicateOf finds the first earlier identical rule", () => {
    const list = [tri, chain, { ...tri }, { ...tri }];

    expect(duplicateOf(list, 0)).toBe(-1);
    expect(duplicateOf(list, 1)).toBe(-1);
    expect(duplicateOf(list, 2)).toBe(0);
    expect(duplicateOf(list, 3)).toBe(0);
    expect(duplicateOf(list, 4)).toBe(-1);
    expect(duplicateOf([tri, { ifMask: 6, thenLayer: 4 }], 1)).toBe(-1);
  });
});

describe("restore clear helpers", () => {
  test("the clears read one shared set of supported commands", () => {
    const supported = new Set(["keymap.custom", KEY_OVERRIDES_COMMAND, CONDITIONAL_LAYERS_COMMAND]);

    expect(needsConditionalLayersClear(["keymap.custom"], supported)).toBe(true);
    expect(needsConditionalLayersClear(["keymap.custom", CONDITIONAL_LAYERS_COMMAND], supported)).toBe(false);
    expect(needsKeyOverridesClear(["keymap.custom", CONDITIONAL_LAYERS_COMMAND], supported)).toBe(true);
  });

  test("no clear when the keyboard lacks the command or its list is unknown", () => {
    expect(needsConditionalLayersClear(["keymap.custom"], new Set(["keymap.custom", KEY_OVERRIDES_COMMAND]))).toBe(false);
    expect(needsConditionalLayersClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("readConditionalLayers", () => {
  test("reads the table", async () => {
    const { device } = fakeDevice("2 6 3 10 4");

    expect(await readConditionalLayers(device)).toEqual([tri, chain]);
  });

  test("returns null on an Error reply, a thrown error or a malformed reply", async () => {
    expect(await readConditionalLayers({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(
      await readConditionalLayers({
        noCacheCommand: async () => {
          throw new Error("closed");
        },
      }),
    ).toBeNull();
    expect(await readConditionalLayers({ noCacheCommand: async () => "2 6" })).toBeNull();
  });
});

describe("writeConditionalLayers", () => {
  test("writes the serialisation, then reads it back uncached", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeConditionalLayers(device, [tri]);

    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "1 6 3"], [CONDITIONAL_LAYERS_COMMAND]]);
  });

  test("writes the empty table", async () => {
    const { device, noCacheCommand } = fakeDevice("1 6 3");

    await writeConditionalLayers(device, []);

    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "0"], [CONDITIONAL_LAYERS_COMMAND]]);
  });

  test("accepts the virtual keyboard, which echoes the payload", async () => {
    let table = "0";
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => {
      if (args.length > 0) {
        table = args.join(" ");
      }

      return table;
    });

    await writeConditionalLayers({ noCacheCommand }, [tri, chain]);

    expect(noCacheCommand).toHaveBeenCalledTimes(2);
    expect(table).toBe("2 6 3 10 4");
  });

  test("rejects invalid rules without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeConditionalLayers(device, [{ ifMask: 6, thenLayer: 1 }])).rejects.toThrow("not sent");
    await expect(writeConditionalLayers(device, [tri, { ...tri }])).rejects.toThrow("not sent");
    await expect(writeConditionalLayers(device, fill(9))).rejects.toThrow("not sent");
    await expect(writeConditionalLayers(device, [{ ifMask: 2 ** 32 + 6, thenLayer: 3 }])).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects the firmware's error reply and reads the kept table back into the cache", async () => {
    const { device, noCacheCommand } = fakeDevice("1 10 4", true);

    await expect(writeConditionalLayers(device, [tri])).rejects.toThrow("rejected");
    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "1 6 3"], [CONDITIONAL_LAYERS_COMMAND]]);
    expect(await noCacheCommand.mock.results[1].value).toBe("1 10 4");
  });

  test("reads the table back into the cache after a failed send, and keeps the send's error when that read fails too", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => {
      throw new Error(args.length > 0 ? "port closed" : "still closed");
    });

    await expect(writeConditionalLayers({ noCacheCommand }, [tri])).rejects.toThrow("port closed");
    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "1 6 3"], [CONDITIONAL_LAYERS_COMMAND]]);
  });

  test("rejects an Error reply to the write", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(writeConditionalLayers({ noCacheCommand }, [tri])).rejects.toThrow("timeout");
    expect(noCacheCommand).toHaveBeenCalledTimes(2);
  });

  test("reads the table again after an Error read-back", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : new Error("timeout")),
    );

    await expect(writeConditionalLayers({ noCacheCommand }, [tri])).rejects.toThrow("timeout");
    expect(noCacheCommand).toHaveBeenCalledTimes(3);
  });

  test("rejects a different table read back, which is already in the cache", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(writeConditionalLayers({ noCacheCommand }, [tri])).rejects.toThrow("did not store");
    expect(noCacheCommand).toHaveBeenCalledTimes(2);
  });

  test("rejects a read-back that is not a table", async () => {
    const noCacheCommand = vi.fn(async (): Promise<unknown> => undefined);

    await expect(writeConditionalLayers({ noCacheCommand }, [])).rejects.toThrow("did not store");
  });
});

describe("restoreConditionalLayers", () => {
  test("writes a valid backup entry and reads it back", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await restoreConditionalLayers(device, "2 6 3 10 4");

    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "2 6 3 10 4"], [CONDITIONAL_LAYERS_COMMAND]]);
  });

  test("rejects malformed data without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreConditionalLayers(device, "[object Object]")).rejects.toThrow("Malformed");
    await expect(restoreConditionalLayers(device, "1 6")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects a well-formed entry the firmware would refuse, without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreConditionalLayers(device, "1 2 3")).rejects.toThrow("not sent");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard refuses the table", async () => {
    const { device } = fakeDevice("0", true);

    await expect(restoreConditionalLayers(device, "1 6 3")).rejects.toThrow("rejected");
  });
});
