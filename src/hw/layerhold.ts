/* eslint-disable no-bitwise */
/* "Hold until layer change" key codes.
 *
 * A shortcut whose modifiers stay pressed after the key is released, until the layer the key sits on turns off.
 * The firmware encodes it as the plain shortcut with Key flag bit 5 set, 0x2000 | mods << 8 | keycode.
 * Firmware without the LayerHoldMods plugin ignores the bit and sends the plain shortcut.
 *
 * A partial hold holds only some of the shortcut's modifiers and sends the rest with each tap. Its code is
 * 0x8000 | slot << 13 | mods << 8 | keycode, with at least two modifiers, and the firmware's holdmods.map table gives its held modifiers.
 * Firmware without the table, or a partial code without an entry, sends the plain shortcut.
 */

export const LAYER_HOLD_FLAG = 0x2000;

/* Command the firmware lists in `help` when it supports the option */
export const LAYER_HOLD_MARKER = "layerhold.state";

const LAYER_HOLD_LAST = 0x3fff;
const MODS_MASK = 0x1f00;

/* RESERVED without SYNTHETIC marks a partial hold. The legacy hold bit picks one of two slots per shortcut */
export const PARTIAL_HOLD_FLAG = 0x8000;
export const PARTIAL_SLOT_FLAG = 0x2000;
const PARTIAL_HOLD_MASK = 0xc000;
const SHORTCUT_MASK = 0x1fff;

/* Base HID keycodes the firmware accepts, `a` to HID_LAST_KEY */
const LAYER_HOLD_MIN_BASE = 0x04;
const LAYER_HOLD_MAX_BASE = 0xdd;

/** Is this a hold until layer change key that holds every modifier? */
export const isLayerHold = (keyCode: number): boolean => keyCode >= LAYER_HOLD_FLAG && keyCode <= LAYER_HOLD_LAST;

/** The plain shortcut a hold key is built from. */
export const fromLayerHold = (keyCode: number): number => keyCode & ~LAYER_HOLD_FLAG;

/** The hold key for a plain shortcut. */
export const toLayerHold = (keyCode: number): number => keyCode | LAYER_HOLD_FLAG;

/** Can this plain shortcut hold its modifiers until the layer changes? */
export const canHoldUntilLayerChange = (keyCode: number): boolean => {
  const base = keyCode & 0xff;
  return (
    keyCode >= 256 &&
    keyCode < LAYER_HOLD_FLAG &&
    (keyCode & MODS_MASK) !== 0 &&
    base >= LAYER_HOLD_MIN_BASE &&
    base <= LAYER_HOLD_MAX_BASE
  );
};

/** Keep the hold flag on an edited shortcut while it still has a modifier. */
export const keepLayerHold = (keyCode: number, held: boolean): number =>
  held && (keyCode & MODS_MASK) !== 0 ? toLayerHold(keyCode) : keyCode;

/** Does the firmware's `help` reply list the hold until layer change command? */
export const hasLayerHoldMarker = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === LAYER_HOLD_MARKER);
};

/** The modifiers of a shortcut or hold code as flags, Ctrl 1, Alt 2, AltGr 4, Shift 8, Gui 16. */
export const shortcutMods = (keyCode: number): number => (keyCode & MODS_MASK) >> 8;

const modCount = (mods: number): number => {
  let count = 0;

  for (let rest = mods; rest !== 0; rest >>= 1) {
    count += rest & 1;
  }

  return count;
};

/** Is this a partial hold code in the shape the firmware accepts? */
export const isPartialHold = (keyCode: number): boolean => {
  if (!Number.isInteger(keyCode) || keyCode < 0 || keyCode > 0xffff || (keyCode & PARTIAL_HOLD_MASK) !== PARTIAL_HOLD_FLAG) {
    return false;
  }

  const base = keyCode & 0xff;
  return modCount(shortcutMods(keyCode)) >= 2 && base >= LAYER_HOLD_MIN_BASE && base <= LAYER_HOLD_MAX_BASE;
};

/** Is this a hold until layer change key, all modifiers or some? */
export const isHoldCode = (keyCode: number): boolean => isLayerHold(keyCode) || isPartialHold(keyCode);

/** The plain shortcut of a hold code, or the code itself for any other key. */
export const holdShortcut = (keyCode: number): number => {
  if (isPartialHold(keyCode)) {
    return keyCode & SHORTCUT_MASK;
  }

  if (isLayerHold(keyCode)) {
    return fromLayerHold(keyCode);
  }

  return keyCode;
};

/** The table slot of a partial hold code, 0 or 1. */
export const holdSlot = (keyCode: number): number => ((keyCode & PARTIAL_SLOT_FLAG) !== 0 ? 1 : 0);

/** The partial hold code for a plain shortcut in one of the two slots. */
export const toPartialHold = (shortcut: number, slot: number): number =>
  PARTIAL_HOLD_FLAG | (slot === 1 ? PARTIAL_SLOT_FLAG : 0) | (shortcut & SHORTCUT_MASK);
