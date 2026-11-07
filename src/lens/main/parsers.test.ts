import { describe, expect, test } from "vitest";
import { COMBO_LAYER_ANY } from "../shared/types";
import { comboNumbersForLayer } from "../renderer/key-label";
import { parseCombos, parseMacros, parseSuperkeys } from "./parsers";

const MAX_COMBOS = 32;

const reply = (records: number[][], fieldsPerRecord: number): string => {
  const values = [records.length];
  for (let i = 0; i < MAX_COMBOS; i += 1) {
    values.push(...(records[i] ?? new Array<number>(fieldsPerRecord).fill(0)));
  }
  return values.join(" ");
};

describe("Lens combos", () => {
  test("parses the six-key format", () => {
    const combos = parseCombos(reply([[48, 49, 50, 51, 52, 53, 2, 1, 29]], 9));

    expect(combos).toEqual([{ positions: [48, 49, 50, 51, 52, 53], layer: 2 }]);
  });

  test("parses a backup from the first firmware, where 255 meant every layer", () => {
    const combos = parseCombos(
      reply(
        [
          [48, 49, 255, 255, 255, 1, 29],
          [50, 51, 255, 255, 1, 1, 30],
        ],
        7,
      ),
    );

    expect(combos).toEqual([
      { positions: [48, 49], layer: COMBO_LAYER_ANY },
      { positions: [50, 51], layer: 1 },
    ]);
  });

  test("a disabled combo keeps its number but badges nothing", () => {
    const combos = parseCombos(reply([[48, 49, 255, 255, 255, 255, 0, 0, 29]], 9));

    expect(combos).toEqual([{ positions: [], layer: 0 }]);
  });

  test("a key in several combos gets every number, on its layer only", () => {
    const combos = [
      { positions: [48, 49], layer: 0 },
      { positions: [49, 50], layer: 0 },
      { positions: [49], layer: 1 },
    ];

    expect(comboNumbersForLayer(combos, 0).get(49)).toBe("C1 C2");
    expect(comboNumbersForLayer(combos, 1).get(49)).toBe("C3");
    expect(comboNumbersForLayer(combos, 1).get(48)).toBeUndefined();
  });
});

describe("Lens superkeys", () => {
  test("splits at each end marker and stops at the double end marker", () => {
    expect(parseSuperkeys("4 5 6 7 8 0 9 10 11 12 13 0 0 65535 65535")).toEqual([
      [4, 5, 6, 7, 8],
      [9, 10, 11, 12, 13],
    ]);
  });

  test("stops at the erased fill", () => {
    expect(parseSuperkeys("4 1 1 1 1 0 65535 65535")).toEqual([[4, 1, 1, 1, 1]]);
  });

  test("keeps an unterminated last Superkey", () => {
    expect(parseSuperkeys("4 5")).toEqual([[4, 5, 1, 1, 1]]);
  });

  test("pads a short Superkey with empty actions", () => {
    expect(parseSuperkeys("4 5 0 0")).toEqual([[4, 5, 1, 1, 1]]);
  });

  test("cuts a Superkey to five actions", () => {
    expect(parseSuperkeys("1 2 3 4 5 6 0 0")).toEqual([[1, 2, 3, 4, 5]]);
  });

  test("reads erased memory and an empty reply as no Superkeys", () => {
    expect(parseSuperkeys("65535 65535 65535")).toEqual([]);
    expect(parseSuperkeys("")).toEqual([]);
  });

  test("stops at 128 Superkeys", () => {
    const raw = `${new Array<string>(130).fill("4 1 1 1 1 0").join(" ")} 0`;

    expect(parseSuperkeys(raw)).toHaveLength(128);
  });
});

describe("Lens macros", () => {
  test("reads a modifier shortcut", () => {
    expect(parseMacros("6 227 8 43 7 227 0 0")).toEqual([
      [
        { type: 6, keyCode: 227 },
        { type: 8, keyCode: 43 },
        { type: 7, keyCode: 227 },
      ],
    ]);
  });

  test("keeps the macro order", () => {
    expect(parseMacros("8 4 0 8 5 0 0")).toEqual([[{ type: 8, keyCode: 4 }], [{ type: 8, keyCode: 5 }]]);
  });

  test("reads an unterminated tail as the last macro", () => {
    expect(parseMacros("8 4 0 8 5")).toEqual([[{ type: 8, keyCode: 4 }], [{ type: 8, keyCode: 5 }]]);
  });

  test("leaves out the options step", () => {
    expect(parseMacros("14 129 8 4 0 0")).toEqual([[{ type: 8, keyCode: 4 }]]);
  });

  test("gives null for a macro with an unknown step and keeps the others", () => {
    expect(parseMacros("8 4 0 99 0 0")).toEqual([[{ type: 8, keyCode: 4 }], null]);
  });

  test("gives null for an invalid Unicode step", () => {
    expect(parseMacros("16 255 0 0")).toEqual([null]);
  });

  test("gives null for a tap code sequence without its terminator", () => {
    expect(parseMacros("13 4")).toEqual([null]);
  });

  test("gives null for a tap sequence with an odd pair", () => {
    expect(parseMacros("12 0 4 0")).toEqual([null]);
  });

  test("gives null for a clipped options step", () => {
    expect(parseMacros("8 4 14")).toEqual([null]);
  });

  test("reads an empty reply as no macros and erased memory as unreadable", () => {
    expect(parseMacros("")).toEqual([]);
    expect(parseMacros("255 255 255")).toEqual([null]);
  });
});
