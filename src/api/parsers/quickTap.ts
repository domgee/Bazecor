/* Bazecor
 * Copyright (C) 2026  DygmaLab SE.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/* Quick tap for dual-function Qukeys in the Sonsei firmware.
 *
 * `qukeys.quickTapTerm` reads the term in ms as a decimal number. A write takes 0 to 1000, where 0 turns quick tap off.
 * A rejected write keeps the old term and replies `error`. The virtual keyboard echoes the value instead, so every write is read back.
 */

export const QUICK_TAP_COMMAND = "qukeys.quickTapTerm";
export const QUICK_TAP_MAX = 1000;

/** Does the firmware's `help` reply list the quick tap command? */
export const hasQuickTapCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === QUICK_TAP_COMMAND);
};

/** An integer from 0 to QUICK_TAP_MAX. */
export const isValidQuickTapTerm = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= QUICK_TAP_MAX;

/** The term in a reply or backup entry, or null when it is not one. */
export const parseQuickTapTerm = (raw: unknown): number | null => {
  if (typeof raw !== "string") {
    return null;
  }

  const text = raw.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const value = parseInt(text, 10);
  return isValidQuickTapTerm(value) ? value : null;
};

/** True when a restore must turn quick tap off, because the keyboard has it and the backup does not. */
export const needsQuickTapClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(QUICK_TAP_COMMAND) && !commands.includes(QUICK_TAP_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface QuickTapDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** The term on the keyboard, or null when it could not be read. Never treat a failed read as off. */
export const readQuickTapTerm = async (device: QuickTapDevice): Promise<number | null> => {
  try {
    return parseQuickTapTerm(await device.noCacheCommand(QUICK_TAP_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the term and read it back. Throw unless the keyboard holds exactly the value sent. */
export const writeQuickTapTerm = async (device: QuickTapDevice, value: number): Promise<void> => {
  if (!isValidQuickTapTerm(value)) {
    throw new Error(`Quick tap term not sent: ${value} is not an integer from 0 to ${QUICK_TAP_MAX}`);
  }

  let stored: number | null;

  try {
    const written = await device.noCacheCommand(QUICK_TAP_COMMAND, String(value));

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the value. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error("The keyboard rejected the quick tap term");
    }

    const reply = await device.noCacheCommand(QUICK_TAP_COMMAND);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = parseQuickTapTerm(reply);
  } catch (error) {
    /* Device caches the value it sent. Read what the keyboard holds, so a later backup does not record the unsent value */
    try {
      await device.noCacheCommand(QUICK_TAP_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* The read-back already put the keyboard's value in the cache */
  if (stored !== value) {
    throw new Error("The keyboard did not store the quick tap term");
  }
};

/** Restore a `qukeys.quickTapTerm` backup entry. Throw on a malformed entry without sending anything. */
export const restoreQuickTap = async (device: QuickTapDevice, data: string): Promise<void> => {
  const value = parseQuickTapTerm(data);

  if (value === null) {
    throw new Error(`Malformed ${QUICK_TAP_COMMAND} backup entry`);
  }

  await writeQuickTapTerm(device, value);
};
