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

/** True for a code point a Unicode step can send, which is an integer above ASCII, at most U+10FFFF and no surrogate */
export const isUnicodeStepCodePoint = (cp: unknown): cp is number =>
  Number.isInteger(cp) &&
  (cp as number) > 0x7f &&
  (cp as number) <= 0x10ffff &&
  ((cp as number) < 0xd800 || (cp as number) > 0xdfff);

/* Low bytes of keys that type nothing although their labels are characters, Caps Lock (⇪) and the arrows (← ↓ ↑ →) */
const NON_TYPING_KEYS = [57, 79, 80, 81, 82];

/* Look up a label, with keys that type nothing counted as unknown */
const typingKey = (label: string, reverse: (label: string) => number): number => {
  const keyCode = reverse(label);
  return NON_TYPING_KEYS.includes(keyCode % 256) ? UNKNOWN_KEY : keyCode;
};

/**
 * Classify one code point of the text tab. The selected keyboard language types what `reverse` finds, by the uppercase label first and
 * then by the character itself for layouts that label keys in lowercase. Only with `unicodeSteps` does a non-ASCII character neither
 * lookup finds become a Unicode step, everything else keeps the key tap the text tab has always made.
 */
export const classifyChar = (symbol: string, reverse: (label: string) => number, unicodeSteps: boolean): TextChar => {
  const upperSymbol = symbol.toUpperCase();
  const item = KEY_LABELS[upperSymbol] ?? upperSymbol;
  const keyCode = typingKey(item, reverse);

  // Use the key of a lowercase label as it is, since its label already is the character
  if (keyCode === UNKNOWN_KEY && symbol !== upperSymbol) {
    const lowerKeyCode = typingKey(symbol, reverse);

    if (lowerKeyCode !== UNKNOWN_KEY) {
      return { kind: "key", item: symbol, keyCode: lowerKeyCode };
    }
  }

  const codePoint = symbol.codePointAt(0) ?? 0;

  if (unicodeSteps && keyCode === UNKNOWN_KEY && isUnicodeStepCodePoint(codePoint)) {
    return { kind: "unicode", codePoint };
  }

  const upper = symbol.toLowerCase() !== symbol;
  return { kind: "key", item, keyCode: upper ? keyCode + SHIFT_FLAG : keyCode };
};

/* Text shown for a Unicode step whose code point is invalid, which only an edited import file can hold */
const INVALID_CODE_POINT = "?";

/** The code point as U+XXXX with at least four hex digits */
export const formatCodePoint = (cp: unknown): string =>
  isUnicodeStepCodePoint(cp) ? `U+${cp.toString(16).toUpperCase().padStart(4, "0")}` : INVALID_CODE_POINT;

/** The character a Unicode step types */
export const unicodeStepText = (cp: unknown): string =>
  isUnicodeStepCodePoint(cp) ? String.fromCodePoint(cp) : INVALID_CODE_POINT;
