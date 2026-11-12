import { describe, expect, test, vi } from "vitest";
import {
  LED_CUSTOM_COMMAND,
  LED_CUSTOM_FIRST,
  LED_CUSTOM_LAST,
  LED_TYPE_LAYERS,
  LED_TYPE_RAINBOW,
  LED_TYPE_SOLID,
  LED_TYPE_STALKER,
  LedCustomDevice,
  LedCustomSlot,
  MAX_LED_SLOTS,
  UNUSED_LED_SLOT,
  canonicalLedSlot,
  emptyLedTable,
  encodeLedSlot,
  gcLedCustom,
  hasLedCustomCommand,
  importLedCustom,
  ledCustomExport,
  ledSlotOf,
  ledSlotRefs,
  ledTypeName,
  needsLedCustomClear,
  parseLedCustomRaw,
  readLedCustom,
  restoreLedCustom,
  serializeLedCustom,
  validateLedCustom,
  validateLedSlot,
  writeLedCustom,
} from "./ledCustom";

const red: LedCustomSlot = { type: LED_TYPE_SOLID, r: 255, g: 0, b: 0, speed: 0 };
const slowRainbow: LedCustomSlot = { type: LED_TYPE_RAINBOW, r: 0, g: 0, b: 0, speed: 120 };
const layers: LedCustomSlot = { type: LED_TYPE_LAYERS, r: 0, g: 0, b: 0, speed: 0 };

const tableWith = (entries: Record<number, LedCustomSlot>): LedCustomSlot[] => {
  const table = emptyLedTable();
  Object.entries(entries).forEach(([slot, settings]) => {
    table[Number(slot)] = settings;
  });
  return table;
};

/* A keyboard that stores what it is sent, unless `reject` says otherwise */
const fakeDevice = (initial = "0", reject = false) => {
  let stored = initial;
  const device: LedCustomDevice & { stored: () => string } = {
    noCacheCommand: vi.fn(async (cmd: string, data?: string) => {
      if (cmd !== LED_CUSTOM_COMMAND) {
        return "";
      }

      if (data === undefined) {
        return stored;
      }

      if (reject) {
        return "error";
      }

      stored = data;
      return "";
    }),
    stored: () => stored,
  };
  return device;
};

describe("hasLedCustomCommand", () => {
  test("finds the command on its own help line", () => {
    expect(hasLedCustomCommand("version\r\nled.custom\r\nled.mode")).toBe(true);
  });

  test("ignores other commands and non-text replies", () => {
    expect(hasLedCustomCommand("led.customize\nled.mode")).toBe(false);
    expect(hasLedCustomCommand(undefined)).toBe(false);
  });
});

describe("ledSlotOf", () => {
  test("maps 17155..17170 to slots 0..15", () => {
    expect(ledSlotOf(LED_CUSTOM_FIRST)).toBe(0);
    expect(ledSlotOf(LED_CUSTOM_LAST)).toBe(MAX_LED_SLOTS - 1);
  });

  test("leaves Next, Previous, Toggle and other codes out", () => {
    expect([17152, 17153, 17154, 17171, 4].map(ledSlotOf)).toEqual([null, null, null, null, null]);
  });
});

describe("parseLedCustomRaw", () => {
  test("reads count, then type r g b speed per slot, padded to 16 slots", () => {
    const table = parseLedCustomRaw("3 1 255 0 0 0 0 0 0 0 0 2 0 0 0 120");

    expect(table).toEqual(tableWith({ 0: red, 2: slowRainbow }));
  });

  test("reads an empty table", () => {
    expect(parseLedCustomRaw("0")).toEqual(emptyLedTable());
  });

  test("reads a reply split over several lines", () => {
    expect(parseLedCustomRaw("1\r\n1 255 0 0 0\r\n")).toEqual(tableWith({ 0: red }));
  });

  test("rejects malformed replies", () => {
    expect(parseLedCustomRaw("")).toBeNull();
    expect(parseLedCustomRaw(undefined)).toBeNull();
    expect(parseLedCustomRaw("2 1 255 0 0 0")).toBeNull();
    expect(parseLedCustomRaw("17")).toBeNull();
    expect(parseLedCustomRaw("1 7 0 0 0 0")).toBeNull();
    expect(parseLedCustomRaw("1 1 256 0 0 0")).toBeNull();
    expect(parseLedCustomRaw("error")).toBeNull();
  });
});

describe("serializeLedCustom", () => {
  test("trims trailing unused slots and keeps the ones in between", () => {
    expect(serializeLedCustom(tableWith({ 0: red, 2: slowRainbow }))).toBe("3 1 255 0 0 0 0 0 0 0 0 2 0 0 0 120");
  });

  test("writes an empty table as 0", () => {
    expect(serializeLedCustom(emptyLedTable())).toBe("0");
  });

  test("zeroes fields a type does not use and spells out Rainbow's default speed", () => {
    const messy = tableWith({
      0: { type: LED_TYPE_SOLID, r: 1, g: 2, b: 3, speed: 9 },
      1: { type: LED_TYPE_RAINBOW, r: 5, g: 5, b: 5, speed: 0 },
      2: { type: LED_TYPE_STALKER, r: 5, g: 5, b: 5, speed: 5 },
    });

    expect(serializeLedCustom(messy)).toBe("3 1 1 2 3 0 2 0 0 0 40 4 0 0 0 0");
  });

  test("round-trips through the parser", () => {
    const raw = "2 5 0 0 0 0 1 10 20 30 0";
    expect(serializeLedCustom(parseLedCustomRaw(raw) ?? [])).toBe(raw);
  });
});

describe("validateLedSlot", () => {
  test("accepts every picker type with its settings", () => {
    expect([red, slowRainbow, layers, UNUSED_LED_SLOT].map(validateLedSlot)).toEqual([null, null, null, null]);
  });

  test("rejects Rainbow faster than the built-in one", () => {
    expect(validateLedSlot({ ...slowRainbow, speed: 39 })).toMatch(/speed/);
  });

  test("accepts Rainbow speed 0, which means 40", () => {
    expect(validateLedSlot({ ...slowRainbow, speed: 0 })).toBeNull();
  });

  test("rejects unknown types and values above a byte", () => {
    expect(validateLedSlot({ ...red, type: 7 })).toMatch(/type/);
    expect(validateLedSlot({ ...red, r: 300 })).toMatch(/byte/);
  });

  test("names the slot of a rejected table", () => {
    expect(validateLedCustom(tableWith({ 3: { ...red, g: -1 } }))).toBe("slot 4: a value is not a byte");
  });
});

describe("canonicalLedSlot", () => {
  test("keeps only what each type uses", () => {
    expect(canonicalLedSlot({ type: LED_TYPE_LAYERS, r: 9, g: 9, b: 9, speed: 9 })).toEqual(layers);
  });
});

describe("ledTypeName", () => {
  test("names each picker type", () => {
    expect([1, 2, 3, 4, 5, 6].map(ledTypeName)).toEqual(["Solid", "Rainbow", "Wave", "Stalker", "Layers", "Off"]);
  });

  test("has no name for unused or unknown types", () => {
    expect([0, 7].map(ledTypeName)).toEqual([null, null]);
  });
});

describe("ledSlotRefs", () => {
  test("collects slots from layers, rule outputs and combo outputs", () => {
    const refs = ledSlotRefs({
      layers: [[4, LED_CUSTOM_FIRST], [LED_CUSTOM_FIRST + 2]],
      rules: [{ output: LED_CUSTOM_FIRST + 5 }],
      combos: [{ action: LED_CUSTOM_FIRST + 7 }, { action: 4 }],
    });

    expect([...refs].sort((a, b) => a - b)).toEqual([0, 2, 5, 7]);
  });
});

describe("encodeLedSlot", () => {
  test("reuses a slot with the same settings", () => {
    const table = tableWith({ 3: red });

    expect(encodeLedSlot({ ...red, speed: 7 }, table, new Set(), new Set())).toEqual({ code: LED_CUSTOM_FIRST + 3, table });
  });

  test("reuses a Rainbow slot stored with speed 0 for speed 40", () => {
    const table = tableWith({ 1: { ...slowRainbow, speed: 0 } });

    expect(encodeLedSlot({ ...slowRainbow, speed: 40 }, table, new Set(), new Set())).toEqual({ code: LED_CUSTOM_FIRST + 1, table });
  });

  test("takes the lowest slot neither the draft uses nor the keyboard may play", () => {
    const table = tableWith({ 0: layers, 1: slowRainbow, 2: layers });

    expect(encodeLedSlot(red, table, new Set([0]), new Set([1]))).toEqual({
      code: LED_CUSTOM_FIRST + 2,
      table: tableWith({ 0: layers, 1: slowRainbow, 2: red }),
    });
  });

  test("stores the canonical settings", () => {
    const encoded = encodeLedSlot({ ...red, speed: 5 }, emptyLedTable(), new Set(), new Set());

    expect(encoded).toEqual({ code: LED_CUSTOM_FIRST, table: tableWith({ 0: red }) });
  });

  test("refuses when every slot is used or protected", () => {
    const used = new Set(Array.from({ length: 8 }, (_, i) => i));
    const protectedSlots = new Set(Array.from({ length: 8 }, (_, i) => i + 8));

    expect(encodeLedSlot(red, emptyLedTable(), used, protectedSlots)).toEqual({ error: "capacity" });
  });

  test("leaves its input table alone", () => {
    const table = emptyLedTable();
    encodeLedSlot(red, table, new Set(), new Set());

    expect(table).toEqual(emptyLedTable());
  });
});

describe("gcLedCustom", () => {
  test("clears every slot outside keep", () => {
    expect(gcLedCustom(tableWith({ 0: red, 4: layers }), new Set([4]))).toEqual(tableWith({ 4: layers }));
  });

  test("returns the table itself when it keeps every used slot", () => {
    const table = tableWith({ 0: red });

    expect(gcLedCustom(table, new Set([0, 9]))).toBe(table);
  });
});

describe("ledCustomExport", () => {
  test("carries the settings of the slots the codes use", () => {
    const table = tableWith({ 0: red, 2: slowRainbow, 5: layers });

    expect(ledCustomExport(table, [LED_CUSTOM_FIRST + 2, 4, LED_CUSTOM_FIRST, LED_CUSTOM_FIRST + 9])).toEqual([
      { slot: 0, ...red },
      { slot: 2, ...slowRainbow },
    ]);
  });
});

describe("importLedCustom", () => {
  test("maps each code to a slot with the file's settings, reusing equal ones", () => {
    const table = tableWith({ 0: layers, 1: red });
    const result = importLedCustom(
      table,
      new Set([0]),
      new Set(),
      [LED_CUSTOM_FIRST + 4, LED_CUSTOM_FIRST + 6, 4],
      [
        { slot: 4, ...red },
        { slot: 6, ...slowRainbow },
      ],
    );

    expect(result).toEqual({
      table: tableWith({ 0: layers, 1: red, 2: slowRainbow }),
      remap: new Map([
        [LED_CUSTOM_FIRST + 4, LED_CUSTOM_FIRST + 1],
        [LED_CUSTOM_FIRST + 6, LED_CUSTOM_FIRST + 2],
      ]),
      emptied: false,
    });
  });

  test("never gives two imported slots the same new slot", () => {
    const result = importLedCustom(
      emptyLedTable(),
      new Set(),
      new Set(),
      [LED_CUSTOM_FIRST, LED_CUSTOM_FIRST + 1],
      [
        { slot: 0, ...red },
        { slot: 1, ...layers },
      ],
    );

    expect(result.remap).toEqual(
      new Map([
        [LED_CUSTOM_FIRST, LED_CUSTOM_FIRST],
        [LED_CUSTOM_FIRST + 1, LED_CUSTOM_FIRST + 1],
      ]),
    );
  });

  test("empties a key whose slot the file does not describe or describes wrongly", () => {
    const result = importLedCustom(emptyLedTable(), new Set(), new Set(), [LED_CUSTOM_FIRST, LED_CUSTOM_FIRST + 1], [
      { slot: 1, ...slowRainbow, speed: 10 },
    ]);

    expect(result).toEqual({
      table: emptyLedTable(),
      remap: new Map([
        [LED_CUSTOM_FIRST, 0],
        [LED_CUSTOM_FIRST + 1, 0],
      ]),
      emptied: true,
    });
  });

  test("empties a key when the keyboard has no room", () => {
    const full = new Set(Array.from({ length: MAX_LED_SLOTS }, (_, i) => i));
    const result = importLedCustom(emptyLedTable(), full, new Set(), [LED_CUSTOM_FIRST], [{ slot: 0, ...red }]);

    expect(result.remap).toEqual(new Map([[LED_CUSTOM_FIRST, 0]]));
    expect(result.emptied).toBe(true);
  });
});

describe("needsLedCustomClear", () => {
  test("clears when the keyboard lists the table and the backup lacks it", () => {
    expect(needsLedCustomClear(["keymap.custom"], new Set([LED_CUSTOM_COMMAND]))).toBe(true);
  });

  test("keeps the table when the backup has it, the keyboard lacks it or help is unknown", () => {
    expect(needsLedCustomClear([LED_CUSTOM_COMMAND], new Set([LED_CUSTOM_COMMAND]))).toBe(false);
    expect(needsLedCustomClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsLedCustomClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("keyboard I/O", () => {
  test("readLedCustom reads uncached and returns null on a bad reply", async () => {
    expect(await readLedCustom(fakeDevice("1 1 255 0 0 0"))).toEqual(tableWith({ 0: red }));
    expect(await readLedCustom(fakeDevice("garbage"))).toBeNull();
  });

  test("writeLedCustom sends the canonical table and reads it back", async () => {
    const device = fakeDevice();
    await writeLedCustom(device, tableWith({ 1: { ...red, speed: 3 } }));

    expect(device.stored()).toBe("2 0 0 0 0 0 1 255 0 0 0");
  });

  test("writeLedCustom throws on an error reply and refreshes the cache", async () => {
    const device = fakeDevice("0", true);

    await expect(writeLedCustom(device, tableWith({ 0: red }))).rejects.toThrow("rejected");
    expect(device.noCacheCommand).toHaveBeenLastCalledWith(LED_CUSTOM_COMMAND);
  });

  test("writeLedCustom refuses a table the firmware would reject without sending it", async () => {
    const device = fakeDevice();

    await expect(writeLedCustom(device, tableWith({ 0: { ...slowRainbow, speed: 20 } }))).rejects.toThrow("not sent");
    expect(device.noCacheCommand).not.toHaveBeenCalled();
  });

  test("writeLedCustom throws when the read-back differs", async () => {
    const device: LedCustomDevice = { noCacheCommand: vi.fn(async (_cmd: string, data?: string) => (data === undefined ? "0" : "")) };

    await expect(writeLedCustom(device, tableWith({ 0: red }))).rejects.toThrow("did not store");
  });

  test("restoreLedCustom writes the backup's table", async () => {
    const device = fakeDevice();
    await restoreLedCustom(device, "1 5 0 0 0 0");

    expect(device.stored()).toBe("1 5 0 0 0 0");
  });

  test("restoreLedCustom fails on a malformed entry", async () => {
    await expect(restoreLedCustom(fakeDevice(), "1 9")).rejects.toThrow("Malformed");
  });
});
