import { describe, expect, test, vi } from "vitest";
import {
  ERASED,
  SUPERKEYS_COMMAND,
  SuperkeysDevice,
  fitSuperkeysForTarget,
  hasUniqueSuperkeysMarker,
  isIdleSuperkey,
  parseSuperkeysRaw,
  parseSuperkeysTable,
  serializeSuperkeyTable,
  serializeSuperkeys,
  superkeyWriteFormat,
  superkeysAvailable,
  uniqueSuperkeysMode,
  writeSuperkeyTable,
} from "./superkeys";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const ERASED_ROW = Array<number>(6).fill(ERASED);

/* A fixed-row reply: `rows` as `a b c d e 0`, then `extra` raw rows, then erased rows up to 129 */
const fixedReply = (rows: number[][], extra: number[][] = [], total = 129): string => {
  const words = rows.flatMap(row => [...row, 0]).concat(extra.flat());

  while (words.length < total * 6) {
    words.push(...ERASED_ROW);
  }

  return words.join(" ");
};

const row = (tap: number, hold = 1) => [tap, hold, 1, 1, 1];

/* A keyboard that stores what it is sent and answers with `answer` when given */
const fakeDevice = (answer?: (sent: string) => unknown) => {
  let stored = "";
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (cmd !== SUPERKEYS_COMMAND) {
      return "";
    }

    if (args.length > 0) {
      stored = args.join(" ");
      return "";
    }

    return answer ? answer(stored) : stored;
  });
  const device: SuperkeysDevice = { noCacheCommand };
  return { device, noCacheCommand };
};

describe("parseSuperkeysTable", () => {
  test("reads the real Sonsei reply, where the old serializer's trailing 0 starts a row before the erased rows", () => {
    const rows = Array.from({ length: 21 }, (_, i) => row(4 + i, 224));
    const raw = fixedReply(rows, [[0, ERASED, ERASED, ERASED, ERASED, ERASED]]);

    const parsed = parseSuperkeysTable(raw);

    expect(raw.split(" ")).toHaveLength(774);
    expect(parsed).toEqual({ table: rows, beyond: new Map(), storedRows: 22 });
  });

  test("reads the padded shape this serializer writes, with interior idle rows", () => {
    const raw = serializeSuperkeyTable([row(4, 224), [1, 1, 1, 1, 1], row(5)], "padded", 3);

    const parsed = parseSuperkeysTable(raw);

    expect(raw.split(" ")).toHaveLength(4 * 6);
    expect(parsed).toEqual({ table: [row(4, 224), [1, 1, 1, 1, 1], row(5)], beyond: new Map(), storedRows: 3 });
  });

  test("counts stale rows up to the first erased row as stored", () => {
    // Write 1 row over a table of 3 old-shape rows, which leaves rows 1 and 2 on the keyboard
    const raw = fixedReply([row(4)], [[5, 1, 1, 1, 1, 0], [6, 1, 1, 1, 1, 0]]);

    expect(parseSuperkeysTable(raw)).toEqual({ table: [row(4), row(5), row(6)], beyond: new Map(), storedRows: 3 });
  });

  test("gives no stored row count for the old separator shape", () => {
    expect(parseSuperkeysTable("4 224 1 1 1 0 5 1 1 1 1 0 0")).toEqual({
      table: [row(4, 224), row(5)],
      beyond: new Map(),
      storedRows: null,
    });
  });

  test("reads an official Defy or Raise2 reply with short rows and erased fill", () => {
    expect(parseSuperkeysTable("4 224 0 5 0 0 65535 65535 65535")).toEqual({
      table: [row(4, 224), row(5)],
      beyond: new Map(),
      storedRows: null,
    });
  });

  test("falls back to the separator path when a fixed-size reply has rows that do not end in 0", () => {
    const raw = `4 1 1 1 1 0 5 0 0 ${Array<number>(774 - 9).fill(ERASED).join(" ")}`;

    expect(parseSuperkeysTable(raw)).toEqual({ table: [row(4), row(5)], beyond: new Map(), storedRows: null });
  });

  test("reads erased memory and the old empty write as no Superkeys", () => {
    expect(parseSuperkeysTable(Array<number>(774).fill(ERASED).join(" "))).toEqual({ table: [], beyond: new Map(), storedRows: 0 });
    expect(parseSuperkeysTable(Array<number>(512).fill(ERASED).join(" "))).toEqual({ table: [], beyond: new Map(), storedRows: null });
  });

  test("splits rows at or above 70 off for display", () => {
    const rows = Array.from({ length: 75 }, (_, i) => row(4 + i));

    const parsed = parseSuperkeysTable(fixedReply(rows));

    expect(parsed?.table).toHaveLength(70);
    expect(parsed?.beyond).toEqual(new Map(rows.slice(70).map((actions, i) => [70 + i, actions])));
    expect(parsed?.storedRows).toBe(75);
  });

  test.each([
    ["an Error", new Error("timeout")],
    ["a number", 4],
    ["an empty reply", ""],
    ["a non-numeric token", "4 1 x 0 0"],
    ["a value past 65535", "65536 1 1 1 1 0 0"],
    ["a row longer than five actions", "4 1 1 1 1 1 0 0"],
    ["more than 128 rows", `${Array<string>(129).fill("4 1 1 1 1 0").join(" ")} 0`],
  ])("returns null for %s", (_, raw) => {
    expect(parseSuperkeysTable(raw)).toBeNull();
  });
});

describe("parseSuperkeysRaw", () => {
  test("keeps the stored names by index and the rows at or above 70", () => {
    const rows = Array.from({ length: 72 }, (_, i) => row(4 + i));

    const superkeys = parseSuperkeysRaw(fixedReply(rows), [{ actions: [], name: "first", id: 0 }]);

    expect(superkeys).toHaveLength(72);
    expect(superkeys[0]).toEqual({ actions: row(4), name: "first", id: 0 });
    expect(superkeys[71]).toEqual({ actions: row(75), name: "", id: 71 });
  });

  test("returns no Superkeys for a reply that is not a table", () => {
    expect(parseSuperkeysRaw("4 x", [])).toEqual([]);
  });
});

describe("serializeSuperkeyTable", () => {
  test("pads to cover the stored rows and one erased row more", () => {
    const words = serializeSuperkeyTable([row(4)], "padded", 5).split(" ").map(Number);

    expect(words).toEqual([4, 1, 1, 1, 1, 0, ...Array<number>(5 * 6).fill(ERASED)]);
  });

  test("pads to all 129 rows when the stored row count is unknown", () => {
    expect(serializeSuperkeyTable([row(4)], "padded", null).split(" ")).toHaveLength(129 * 6);
  });

  test("ends a table longer than the stored rows with one erased row", () => {
    expect(serializeSuperkeyTable([row(4), row(5), row(6)], "padded", 1).split(" ")).toHaveLength(4 * 6);
  });

  test("writes 0 and missing actions as idle", () => {
    expect(serializeSuperkeyTable([[4, 0]], "padded", 0)).toBe(`4 1 1 1 1 0 ${ERASED_ROW.join(" ")}`);
  });

  test("writes the old shape for other keyboards", () => {
    expect(serializeSuperkeyTable([row(4, 224), [5]], "legacy", null)).toBe("4 224 1 1 1 0 5 1 1 1 1 0 0");
  });

  test("writes the old erased fill for an empty legacy table", () => {
    expect(serializeSuperkeyTable([], "legacy", null)).toBe(Array<number>(512).fill(ERASED).join(" "));
  });

  test("refuses more than 70 rows", () => {
    const rows = Array.from({ length: 71 }, () => row(4));

    expect(() => serializeSuperkeyTable(rows, "padded", null)).toThrow();
    expect(() => serializeSuperkeyTable(rows, "legacy", null)).toThrow();
  });

  test("keeps the old editors' write unchanged", () => {
    expect(serializeSuperkeys([{ actions: [4, 224, 0], name: "", id: 0 }])).toBe("4 224 1 1 1 0 0");
    expect(serializeSuperkeys([])).toBe(Array<number>(512).fill(ERASED).join(" "));
  });
});

describe("writeSuperkeyTable", () => {
  test("writes uncached, reads back and returns the table length for the padded shape", async () => {
    const { device, noCacheCommand } = fakeDevice();

    const storedRows = await writeSuperkeyTable(device, [row(4, 224)], "padded", 3);

    expect(storedRows).toBe(1);
    expect(noCacheCommand.mock.calls).toEqual([
      [SUPERKEYS_COMMAND, serializeSuperkeyTable([row(4, 224)], "padded", 3)],
      [SUPERKEYS_COMMAND],
    ]);
  });

  test("returns the read-back stored row count for the legacy shape", async () => {
    const { device } = fakeDevice();

    expect(await writeSuperkeyTable(device, [row(4)], "legacy", null)).toBeNull();
  });

  test("throws when the keyboard holds something else", async () => {
    const { device } = fakeDevice(() => fixedReply([row(5)]));

    await expect(writeSuperkeyTable(device, [row(4)], "padded", null)).rejects.toThrow("did not store");
  });

  test("throws when stale rows stay behind a padded table", async () => {
    // The old serializer's trailing 0 row is still active up to the first erased row
    const { device } = fakeDevice(() => fixedReply([row(4)], [[0, ERASED, ERASED, ERASED, ERASED, ERASED]]));

    await expect(writeSuperkeyTable(device, [row(4)], "padded", null)).rejects.toThrow("stale");
  });

  test("throws when the read-back fails", async () => {
    const { device } = fakeDevice(() => new Error("timeout"));

    await expect(writeSuperkeyTable(device, [row(4)], "padded", null)).rejects.toThrow("timeout");
  });
});

describe("product helpers", () => {
  test.each([
    ["Sonsei", "padded"],
    ["Defy", "legacy"],
    ["Raise2", "legacy"],
    ["Raise", "legacy"],
    [undefined, "legacy"],
  ])("%s writes the %s shape", (product, format) => {
    expect(superkeyWriteFormat(product)).toBe(format);
  });

  test.each([
    ["Sonsei", "v1.2.0", true],
    ["Defy", "v1.0.0", true],
    ["Raise", "v1.0.0beta", true],
    ["Raise", "v1.0.0 kaleidoscope", false],
    ["Raise", undefined, false],
  ])("%s %s has Superkeys: %s", (product, version, available) => {
    expect(superkeysAvailable(product, version)).toBe(available);
  });

  test("isIdleSuperkey treats 0, 1 and missing actions as idle and 65535 as set", () => {
    expect(isIdleSuperkey([1, 0, 1])).toBe(true);
    expect(isIdleSuperkey(undefined)).toBe(true);
    expect(isIdleSuperkey([1, 65535])).toBe(false);
  });
});

describe("fitSuperkeysForTarget", () => {
  test("writes a padded Sonsei table in the old shape for a Defy, rows 0..69 only", () => {
    const rows = Array.from({ length: 72 }, (_, i) => row(4 + i));

    const fitted = fitSuperkeysForTarget(serializeSuperkeyTable(rows.slice(0, 70), "padded", null), "Defy");
    const fromFull = fitSuperkeysForTarget(fixedReply(rows), "Defy");

    expect(fitted).toBe(serializeSuperkeyTable(rows.slice(0, 70), "legacy", null));
    expect(fromFull).toBe(fitted);
  });

  test("writes an old-shape table as all 129 padded rows for a Sonsei", () => {
    const fitted = fitSuperkeysForTarget("4 224 1 1 1 0 5 1 1 1 1 0 0", "Sonsei");

    expect(fitted.split(" ")).toHaveLength(129 * 6);
    expect(parseSuperkeysTable(fitted)).toEqual({ table: [row(4, 224), row(5)], beyond: new Map(), storedRows: 2 });
  });

  test("leaves data that is not a Superkey table unchanged", () => {
    expect(fitSuperkeysForTarget("4 x 0", "Sonsei")).toBe("4 x 0");
    expect(fitSuperkeysForTarget("4 x 0", "Defy")).toBe("4 x 0");
  });
});

describe("unique Superkeys capability", () => {
  test.each([
    ["help\r\nsuperkeys.map\r\nsuperkeys.unique\r\nversion", true],
    ["superkeys.map\nsuperkeys.unique", true],
    ["help\r\nsuperkeys.map\r\nversion", false],
    ["superkeys.uniqueX", false],
    ["", false],
    [undefined, false],
    [42, false],
  ])("hasUniqueSuperkeysMarker(%j) is %s", (help, expected) => {
    expect(hasUniqueSuperkeysMarker(help)).toBe(expected);
  });

  test.each([
    [true, "unique"],
    [false, "legacy"],
    ["unknown", "unknown"],
    [undefined, "unknown"],
    [null, "unknown"],
    ["true", "unknown"], // Only a boolean comes from a successful help read
    [1, "unknown"],
  ])("uniqueSuperkeysMode(%j) is %s", (stored, expected) => {
    expect(uniqueSuperkeysMode(stored)).toBe(expected);
  });
});
