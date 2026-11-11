/* Repeat key code.
 *
 * A single key that sends the last key typed again, with the modifiers it had. Modifiers held when it is pressed add to them.
 * Firmware without the RepeatKey plugin treats the code as a dead key.
 */

export enum RepeatKeyCodes {
  REPEAT_KEY = 53594, // 0xD15A, ranges::REDIAL
}

/* Command the firmware lists in `help` when it has the Repeat key */
export const REPEAT_KEY_MARKER = "repeatkey.state";

/** Is this the Repeat key? */
export const isRepeatKey = (keyCode: number): boolean => keyCode === RepeatKeyCodes.REPEAT_KEY;

/** Does the firmware's `help` reply list the Repeat key command? */
export const hasRepeatKeyMarker = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === REPEAT_KEY_MARKER);
};
