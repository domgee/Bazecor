import { describe, expect, test } from "vitest";
import { classifyChar, formatCodePoint, unicodeStepText } from "./textChars";

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

  test("a lowercase layout label gives its key without the shift flag", () => {
    // Label é and ß in lowercase, as French and German layouts do
    const lowercaseReverse = (label: string) => ({ é: 31, ß: 45 })[label] ?? 1;

    const classified = Array.from("éÉß").map(symbol => classifyChar(symbol, lowercaseReverse, true));

    expect(classified).toEqual([
      { kind: "key", item: "é", keyCode: 31 },
      // The layout has no uppercase É, so it needs a Unicode step
      { kind: "unicode", codePoint: 0xc9 },
      { kind: "key", item: "ß", keyCode: 45 },
    ]);
  });

  test("a lowercase layout label gives its key also without Unicode steps", () => {
    const classified = classifyChar("é", label => ({ é: 31 })[label] ?? 1, false);

    expect(classified).toEqual({ kind: "key", item: "é", keyCode: 31 });
  });

  test("an arrow or Caps Lock label counts as a character the language cannot type", () => {
    // Label Right Arrow (79) and Caps Lock (57) with their symbols, as KeymapDB does
    const symbolReverse = (label: string) => ({ "→": 79, "⇪": 57 })[label] ?? 1;

    const classified = [true, false].map(unicodeSteps => classifyChar("→", symbolReverse, unicodeSteps));

    expect(classified).toEqual([
      { kind: "unicode", codePoint: 0x2192 },
      { kind: "key", item: "→", keyCode: 1 },
    ]);
  });

  test("an ASCII character the language cannot type keeps today's key code", () => {
    const classified = classifyText("~", true);

    expect(classified).toEqual([{ kind: "key", item: "~", keyCode: 1 }]);
  });
});

describe("formatCodePoint and unicodeStepText", () => {
  test("pad to four hex digits and give the character", () => {
    expect([0xe9, 0x1f600].map(cp => [formatCodePoint(cp), unicodeStepText(cp)])).toEqual([
      ["U+00E9", "é"],
      ["U+1F600", "😀"],
    ]);
  });

  test("show invalid code points from an edited import file as a question mark", () => {
    const invalid = [0x110000, -1, 0xd800, 233.5, "233", 0x41];

    expect(invalid.map(cp => [formatCodePoint(cp), unicodeStepText(cp)])).toEqual(invalid.map(() => ["?", "?"]));
  });
});
