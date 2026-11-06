/* Swap hands key codes.
 *
 * While swap is on, each key acts as the key in the mirrored position on the other half. Swap keys themselves never move.
 * The firmware has four control keys, then one "swap on hold, key on tap" code per base HID keycode, SWAP_HANDS_TAP_FIRST + kc.
 * Firmware without the SwapHands plugin treats every code here as a dead key.
 */

export enum SwapHandsCodes {
  SWAP_HANDS_MON = 54372, // 0xD464
  SWAP_HANDS_TOGGLE = 54373,
  SWAP_HANDS_TAP_TOGGLE = 54374,
  SWAP_HANDS_ONESHOT = 54375,
  SWAP_HANDS_TAP_FIRST = 54376,
  SWAP_HANDS_TAP_LAST = 54631,
}

export const SWAP_HANDS_FIRST = SwapHandsCodes.SWAP_HANDS_MON;
export const SWAP_HANDS_LAST = SwapHandsCodes.SWAP_HANDS_TAP_LAST;

/* Command the firmware lists in `help` when it has swap hands */
export const SWAP_HANDS_MARKER = "swaphands.state";

/* Tap keys Bazecor offers, `a` to the last HID key */
export const SWAP_TAP_MIN_BASE = 0x04;
export const SWAP_TAP_MAX_BASE = 0xdd;

/* Tap key for a new "swap on hold" key, Space */
export const SWAP_TAP_DEFAULT = 0x2c;

/** Is this any swap hands key? */
export const isSwapHandsCode = (keyCode: number): boolean => keyCode >= SWAP_HANDS_FIRST && keyCode <= SWAP_HANDS_LAST;

/** Is this a "swap on hold, key on tap" key? */
export const isSwapTap = (keyCode: number): boolean =>
  keyCode >= SwapHandsCodes.SWAP_HANDS_TAP_FIRST && keyCode <= SwapHandsCodes.SWAP_HANDS_TAP_LAST;

/** The tap key of a "swap on hold, key on tap" key. */
export const swapTapBase = (keyCode: number): number => keyCode - SwapHandsCodes.SWAP_HANDS_TAP_FIRST;

/** The "swap on hold, key on tap" key for a tap key. */
export const toSwapTap = (baseKeyCode: number): number => SwapHandsCodes.SWAP_HANDS_TAP_FIRST + baseKeyCode;

/** Can this key be the tap key of a "swap on hold" key? */
export const canSwapTap = (keyCode: number): boolean => keyCode >= SWAP_TAP_MIN_BASE && keyCode <= SWAP_TAP_MAX_BASE;

/** Does the firmware's `help` reply list the swap hands command? */
export const hasSwapHandsMarker = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === SWAP_HANDS_MARKER);
};
