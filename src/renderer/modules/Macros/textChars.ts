/* One character of the text tab becomes a key tap or, with the macro upgrade, a Unicode step */
export type TextChar = { kind: "key"; item: string; keyCode: number } | { kind: "unicode"; codePoint: number };

/* Key code KeymapDB.reverse returns for a label it does not know */
export const UNKNOWN_KEY = 1;

/* Shift flag added to the key code of an uppercase character */
const SHIFT_FLAG = 2048;

const KEY_LABELS: Record<string, string> = {
  " ": "SPACE",
  "\n": "ENTER",
};

/** True for a code point a Unicode step can send, which is above ASCII, at most U+10FFFF and no surrogate */
export const isUnicodeStepCodePoint = (cp: number): boolean => cp > 0x7f && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff);

/**
 * Classify one code point of the text tab. The selected keyboard language types what `reverse` finds. Only with `unicodeSteps` does a
 * non-ASCII character it cannot find become a Unicode step, everything else keeps the key tap the text tab has always made.
 */
export const classifyChar = (symbol: string, reverse: (label: string) => number, unicodeSteps: boolean): TextChar => {
  const upperSymbol = symbol.toUpperCase();
  const item = KEY_LABELS[upperSymbol] ?? upperSymbol;
  const keyCode = reverse(item);
  const codePoint = symbol.codePointAt(0) ?? 0;

  if (unicodeSteps && keyCode === UNKNOWN_KEY && isUnicodeStepCodePoint(codePoint)) {
    return { kind: "unicode", codePoint };
  }

  const upper = symbol.toLowerCase() !== symbol;
  return { kind: "key", item, keyCode: upper ? keyCode + SHIFT_FLAG : keyCode };
};

/** The code point as U+XXXX with at least four hex digits */
export const formatCodePoint = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
