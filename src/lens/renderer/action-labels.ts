/* eslint-disable no-bitwise */
import type { FunctionIconName, LensMacroAction } from "../shared/types";
import type { SymbolOverrides } from "./layouts";
import { MACRO_STEP } from "../../api/parsers/macroSteps";
import { decodeKey, ledCustomLabel, macroIndex, superkeyIndex } from "./keycodes";
import type { LedCustomSlot } from "../../api/parsers/ledCustom";

/* Short text for Superkey actions and macros on the expanded Lens key faces */

export type ModStyle = "mac" | "text";

// Bazecor's modifier abbreviations, in the order Bazecor lists them
export const MOD_ABBR: Record<string, string> = { Ctrl: "C", Alt: "A", AltGr: "AGr", Shift: "S", OS: "O" };
export const MOD_ORDER = ["Ctrl", "Alt", "AltGr", "Shift", "OS"];

// Two-line keys (Super/name, Macro/name, Mouse/UP) use this size for both lines
export const FACE_SUBTITLE_FS = 11;
// The smallest size fitFontSize gives a subtitle
const SMALLEST_SUBTITLE_FS = FACE_SUBTITLE_FS * 0.62;

/** Shrink a line's font so Bazecor's longer labels ("BACKSPACE", "PAGE DOWN")
 * still fit a standard 57px key face instead of overflowing. */
export function fitFontSize(text: string, base: number): number {
  if (text.length >= 9) return base * 0.62;
  if (text.length >= 7) return base * 0.72;
  if (text.length >= 5) return base * 0.85;
  return base;
}

export interface LabelContext {
  overrides: Record<number, string>;
  symbols: SymbolOverrides;
  layerNames: string[];
  macroNames: string[];
  superkeyNames: string[];
  modStyle: ModStyle;
  /* The custom LED effect slots, so slot keys read as their effect */
  ledCustom?: ReadonlyArray<LedCustomSlot>;
}

export interface CompactLabel {
  text: string;
  icon?: FunctionIconName;
  holdIcon?: "lock" | "shift" | "oneshot";
}

/** Always 5 entries, indexed like the Superkey actions. Null is an empty action */
export type SlotLabels = (CompactLabel | null)[];

export const SLOT_FS_TAP = 9;
export const SLOT_FS_CORNER = 7.5;
// A standard 49 px face minus a margin
export const MACRO_FACE_MAX_WIDTH = 45;

const ELLIPSIS = "…";

const MOD_GLYPH: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", AltGr: "⌥", Shift: "⇧", OS: "⌘" };
const MAC_GLYPH_ORDER = ["⌃", "⌥", "⇧", "⌘"];

const BARE_MOD_MAC: Record<number, string> = { 224: "⌃", 225: "⇧", 226: "⌥", 227: "⌘", 228: "⌃", 229: "⇧", 230: "⌥", 231: "⌘" };
const BARE_MOD_TEXT: Record<number, string> = {
  224: "Ctrl",
  225: "Shft",
  226: "Alt",
  227: "OS",
  228: "Ctrl",
  229: "Shft",
  230: "AGr",
  231: "OS",
};

const KEY_SHORT: Record<number, string> = {
  40: "⏎",
  41: "ESC",
  42: "⌫",
  43: "TAB",
  44: "SPC",
  57: "CAPS",
  70: "PRSC",
  71: "SCRL",
  73: "INS",
  75: "PGUP",
  76: "DEL",
  78: "PGDN",
};

const FUNCTION_TEXT: Record<FunctionIconName, string> = {
  mute: "MUTE",
  "vol-up": "VOL+",
  "vol-down": "VOL-",
  "play-pause": "⏯",
  next: "⏭",
  prev: "⏮",
  stop: "⏹",
  eject: "⏏",
  shuffle: "SHUF",
  camera: "CAM",
  calculator: "CALC",
  "bright-up": "BRI+",
  "bright-down": "BRI-",
  "power-off": "PWR",
  sleep: "SLEEP",
};

// Caps Lock and the arrows type no text, the same set as Bazecor's textChars.ts
const NON_TYPING_KEYS = new Set([57, 79, 80, 81, 82]);

// Modifier flag bits of a keycode's high byte, per held modifier key
const MOD_FLAG: Record<number, number> = {
  224: 0x01,
  228: 0x01,
  226: 0x02,
  230: 0x04,
  225: 0x08,
  229: 0x08,
  227: 0x10,
  231: 0x10,
};
const SHIFT_FLAG = 0x08;
const SPACE_CODE = 44;
const PLAIN_KEY_LIMIT = 0x2000;

const isModifierCode = (code: number) => code >= 224 && code <= 231;
const isEmptyAction = (code: number) => code === 0 || code === 1 || code === 65535;
const isSingleCodePoint = (text: string) => [...text].length === 1;
const isLetter = (text: string) => /\p{L}/u.test(text);

// Approximate glyph widths in em, so labels are cut before they overflow a slot
const WIDE_CHARS = new Set([..."MWmw@%⌘⌥⇧⌃⏎⌫←→↑↓…"]);
const NARROW_CHARS = new Set([..."iljtfrI.,:;'|! "]);
const NARROWEST_EM = 0.34;
const DOUBLE_WIDTH_RE = /\p{Extended_Pictographic}/u;

function charWidth(ch: string): number {
  if (WIDE_CHARS.has(ch)) {
    return 0.92;
  }

  if (DOUBLE_WIDTH_RE.test(ch) || (ch.codePointAt(0) ?? 0) >= 0x2e80) {
    return 1.24;
  }

  if (NARROW_CHARS.has(ch)) {
    return NARROWEST_EM;
  }

  return 0.64;
}

export function modStyleFor(userAgent: string): ModStyle {
  return /Mac/.test(userAgent) ? "mac" : "text";
}

export function textWidth(text: string, fontSize: number): number {
  return [...text].reduce((sum, ch) => sum + charWidth(ch), 0) * fontSize;
}

// Every code point is at least NARROWEST_EM wide, so no prefix longer than this can fit
function maxPrefixLength(maxWidth: number, smallestFontSize: number): number {
  return Math.ceil(maxWidth / (NARROWEST_EM * smallestFontSize)) + 1;
}

/** `text` when it fits, otherwise its longest prefix that fits with "…" added */
export function fitText(text: string, fontSize: number, maxWidth: number): string {
  if (textWidth(text, fontSize) <= maxWidth) {
    return text;
  }

  const chars = [...text];
  const ellipsisWidth = textWidth(ELLIPSIS, fontSize);

  for (let n = Math.min(chars.length - 1, maxPrefixLength(maxWidth, fontSize)); n > 0; n -= 1) {
    const prefix = chars.slice(0, n).join("").trimEnd();

    if (prefix && textWidth(prefix, fontSize) + ellipsisWidth <= maxWidth) {
      return `${prefix}${ELLIPSIS}`;
    }
  }

  return ELLIPSIS;
}

/** Width budget of a Superkey slot. The tap slot spans the face, each corner gets half of it */
export function slotMaxWidth(halfW: number, slot: number): number {
  return slot === 0 ? 2 * halfW - 6 : halfW - 4;
}

/** Like fitText, at the font size the face gives a macro subtitle of that length */
export function fitMacroSubtitle(text: string, maxWidth = MACRO_FACE_MAX_WIDTH): string {
  const fits = (candidate: string) => textWidth(candidate, fitFontSize(candidate, FACE_SUBTITLE_FS)) <= maxWidth;

  if (fits(text)) {
    return text;
  }

  // The font depends on the length and does not shrink steadily, so take the longest candidate that fits
  const chars = [...text];

  for (let n = Math.min(chars.length - 1, maxPrefixLength(maxWidth, SMALLEST_SUBTITLE_FS)); n > 0; n -= 1) {
    const prefix = chars.slice(0, n).join("").trimEnd();

    if (prefix && fits(`${prefix}${ELLIPSIS}`)) {
      return `${prefix}${ELLIPSIS}`;
    }
  }

  return ELLIPSIS;
}

function modPrefix(mods: string[], style: ModStyle): string {
  if (style === "mac") {
    const glyphs = new Set(mods.map(m => MOD_GLYPH[m]));
    return MAC_GLYPH_ORDER.filter(g => glyphs.has(g)).join("");
  }

  return MOD_ORDER.filter(m => mods.includes(m))
    .map(m => `${MOD_ABBR[m]}+`)
    .join("");
}

function bareModifier(code: number, style: ModStyle): string {
  return style === "mac" ? BARE_MOD_MAC[code] : BARE_MOD_TEXT[code];
}

/** Short label of one key action, null for an empty action */
export function compactActionLabel(code: number, ctx: LabelContext): CompactLabel | null {
  if (isEmptyAction(code)) {
    return null;
  }

  const sk = superkeyIndex(code);
  if (sk !== null) {
    return { text: ctx.superkeyNames[sk] || `SK${sk + 1}` };
  }

  const macro = macroIndex(code);
  if (macro !== null) {
    return { text: ctx.macroNames[macro] || `M${macro + 1}` };
  }

  const led = ledCustomLabel(code, ctx.ledCustom);
  if (led !== null) {
    return { text: `LED ${led.subtitle}` };
  }

  const d = decodeKey(code, ctx.overrides, ctx.layerNames, ctx.macroNames, ctx.symbols);

  if (d.icon) {
    return { text: "", icon: d.icon };
  }

  if (d.holdIcon) {
    return { text: d.primary, holdIcon: d.holdIcon };
  }

  if (isModifierCode(code)) {
    return { text: bareModifier(code, ctx.modStyle) };
  }

  if (d.modifiers?.length) {
    return { text: modPrefix(d.modifiers, ctx.modStyle) + (KEY_SHORT[code & 0xff] ?? d.primary) };
  }

  const text = KEY_SHORT[code] ?? (d.subtitle ? `${d.primary} ${d.subtitle}` : d.primary);
  return { text: d.hold ? `${text}/${d.hold}` : text };
}

/** compactActionLabel as plain text, with icons spelled out */
export function compactActionText(code: number, ctx: LabelContext): string {
  const label = compactActionLabel(code, ctx);

  if (!label) {
    return "";
  }

  if (label.icon) {
    return FUNCTION_TEXT[label.icon];
  }

  if (label.holdIcon) {
    return `L${label.text}`;
  }

  return label.text;
}

/** What a combo sends as badge text, null when it sends nothing Lens can name */
export function comboOutputLabel(action: number, ctx: LabelContext): string | null {
  const text = compactActionText(action, ctx);
  return text.trim() ? text : null;
}

/** Labels for the 5 slots of a Superkey, null when it has no actions */
export function superkeySlotLabels(actions: number[] | undefined, ctx: LabelContext): SlotLabels | null {
  if (!actions || actions.slice(0, 5).every(isEmptyAction)) {
    return null;
  }

  return Array.from({ length: 5 }, (_, i) => compactActionLabel(actions[i] ?? 1, ctx));
}

/** The keys a macro sends as short text, like "⌘TAB" or the text it types. Null when Lens cannot read it or it sends nothing */
export function macroKeysLabel(actions: LensMacroAction[] | null | undefined, ctx: LabelContext): string | null {
  if (!actions || actions.length === 0) {
    return null;
  }

  // Held modifier key -> whether a key was sent while it was held
  const held = new Map<number, boolean>();
  const tokens: string[] = [];
  let run = "";

  const flush = () => {
    const text = run.trim();

    if (text) {
      tokens.push(text);
    } else if (run) {
      tokens.push(KEY_SHORT[SPACE_CODE]);
    }

    run = "";
  };

  const heldFlags = () => {
    let flags = 0;
    held.forEach((_, mod) => {
      flags |= MOD_FLAG[mod];
    });
    return flags;
  };

  // The character a plain key types with the held modifiers, or null when it is a shortcut or a key that types nothing
  const typedText = (combined: number): string | null => {
    const flags = combined >> 8;
    const base = combined & 0xff;

    if (ctx.symbols[combined]) {
      return ctx.symbols[combined];
    }

    const d = decodeKey(base, ctx.overrides, ctx.layerNames, ctx.macroNames, ctx.symbols);
    const label = d.subtitle ? "" : d.primary;

    if (flags === 0 && base === SPACE_CODE) {
      return " ";
    }

    if (flags === 0 && !NON_TYPING_KEYS.has(base) && isSingleCodePoint(label)) {
      return isLetter(label) ? label.toLowerCase() : label;
    }

    if (flags === SHIFT_FLAG && isSingleCodePoint(label) && isLetter(label)) {
      return label.toUpperCase();
    }

    return null;
  };

  const sendKey = (code: number) => {
    if (isEmptyAction(code)) {
      return;
    }

    if (code >= PLAIN_KEY_LIMIT) {
      flush();
      tokens.push(compactActionText(code, ctx));
      return;
    }

    const combined = code | (heldFlags() << 8);
    held.forEach((_, mod) => held.set(mod, true));

    const text = typedText(combined);
    if (text !== null) {
      run += text;
      return;
    }

    flush();
    tokens.push(compactActionText(combined, ctx));
  };

  const releaseModifier = (code: number) => {
    if (held.get(code) === false) {
      flush();
      tokens.push(bareModifier(code, ctx.modStyle));
    }

    held.delete(code);
  };

  actions.forEach(({ type, keyCode }) => {
    const codes = Array.isArray(keyCode) ? keyCode : [keyCode];

    switch (type) {
      case MACRO_STEP.KEYDOWN:
      case MACRO_STEP.KEYCODEDOWN:
        if (isModifierCode(codes[0])) {
          held.set(codes[0], false);
        } else {
          sendKey(codes[0]);
        }
        break;
      case MACRO_STEP.KEYUP:
      case MACRO_STEP.KEYCODEUP:
        if (isModifierCode(codes[0])) {
          releaseModifier(codes[0]);
        }
        break;
      case MACRO_STEP.TAP:
      case MACRO_STEP.TAPCODE:
      case MACRO_STEP.TAP_SEQUENCE:
      case MACRO_STEP.TAP_CODE_SEQUENCE:
        codes.forEach(sendKey);
        break;
      case MACRO_STEP.UNICODE:
        run += String.fromCodePoint(codes[0]);
        break;
      default:
        break;
    }
  });

  flush();
  held.forEach((used, mod) => {
    if (!used) {
      tokens.push(bareModifier(mod, ctx.modStyle));
    }
  });

  const label = tokens.join(" ");
  return label.trim() ? label : null;
}

/** Macro names for the key faces, with each readable macro replaced by the keys it sends */
export function macroDisplayNames(names: string[], macros: (LensMacroAction[] | null)[], ctx: LabelContext): string[] {
  return Array.from({ length: Math.max(names.length, macros.length) }, (_, i) => {
    const label = macroKeysLabel(macros[i], ctx);
    return label ? fitMacroSubtitle(label) : (names[i] ?? "");
  });
}
