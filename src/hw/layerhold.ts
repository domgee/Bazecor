/* eslint-disable no-bitwise */
/* "Hold until layer change" key codes.
 *
 * A shortcut whose modifiers stay pressed after the key is released, until the
 * layer the key sits on turns off. The firmware encodes it as the plain shortcut
 * with Key flag bit 5 set, 0x2000 | mods << 8 | keycode. Firmware without the
 * LayerHoldMods plugin ignores the bit and sends the plain shortcut.
 */

export const LAYER_HOLD_FLAG = 0x2000;

/* Command the firmware lists in `help` when it supports the option */
export const LAYER_HOLD_MARKER = "layerhold.state";

const LAYER_HOLD_LAST = 0x3fff;
const MODS_MASK = 0x1f00;

/* Base HID keycodes the firmware accepts, `a` to HID_LAST_KEY */
const LAYER_HOLD_MIN_BASE = 0x04;
const LAYER_HOLD_MAX_BASE = 0xdd;

/** Is this a hold until layer change key? */
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
