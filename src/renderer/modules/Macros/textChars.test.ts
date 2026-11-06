import { describe, expect, test } from "vitest";
import { classifyChar, formatCodePoint } from "./textChars";

// Stand in for KeymapDB.reverse of a language with these key labels, 1 for any other label
const LABELS: Record<string, number> = { A: 4, B: 5, SPACE: 44, ENTER: 40, "1": 30, Ø: 52 };
const reverse = (label: string) => LABELS[label] ?? 1;

// Classify every code point the way the text tab does
const classifyText = (text: string, unicodeSteps: boolean) =>
  Array.from(text).map(symbol => classifyChar(symbol, reverse, unicodeSteps));

describe("classifyChar", () => {
  test("ASCII gives keys with the shift flag for uppercase", () => {
    const classified = classifyText("aB 1\n", true);

    expect(classified).toEqual([
      { kind: "key", item: "A", keyCode: 4 },
      // 2048 is the shift flag
      { kind: "key", item: "B", keyCode: 5 + 2048 },
      { kind: "key", item: "SPACE", keyCode: 44 },
      { kind: "key", item: "1", keyCode: 30 },
      { kind: "key", item: "ENTER", keyCode: 40 },
    ]);
  });

  test("a non-ASCII character the language can type gives a key", () => {
    const classified = classifyText("øØ", true);

    expect(classified).toEqual([
      { kind: "key", item: "Ø", keyCode: 52 },
      { kind: "key", item: "Ø", keyCode: 52 + 2048 },
    ]);
  });

  test("a character the language cannot type gives one Unicode step per code point", () => {
    const classified = classifyText("é😀", true);

    expect(classified).toEqual([
      { kind: "unicode", codePoint: 0xe9 },
      { kind: "unicode", codePoint: 0x1f600 },
    ]);
  });

  test("without Unicode steps the character keeps key code 1, one action per code point", () => {
    const classified = classifyText("é😀", false);

    // Look up "é" by its uppercase label like any letter
    expect(classified).toEqual([
      { kind: "key", item: "É", keyCode: 1 },
      { kind: "key", item: "😀", keyCode: 1 },
    ]);
  });

  test("an ASCII character the language cannot type keeps today's key code", () => {
    const classified = classifyText("~", true);

    expect(classified).toEqual([{ kind: "key", item: "~", keyCode: 1 }]);
  });
});

describe("formatCodePoint", () => {
  test("pads to four hex digits", () => {
    expect([0xe9, 0x1f600].map(formatCodePoint)).toEqual(["U+00E9", "U+1F600"]);
  });
});
