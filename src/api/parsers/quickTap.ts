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

/* Handle `qukeys.quickTapTerm`, the quick tap term of the Sonsei firmware's Qukeys.
 *
 * Read and write the term in ms as a decimal from 0 to 1000, where 0 turns quick tap off. Expect `error` on a rejected write, which
 * keeps the old term. Read every write back, since the virtual keyboard echoes the value instead.
 */

export const QUICK_TAP_COMMAND = "qukeys.quickTapTerm";
export const QUICK_TAP_MAX = 1000;

/** Return true when the firmware's `help` reply lists the quick tap command. */
export const hasQuickTapCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === QUICK_TAP_COMMAND);
};

/** Accept only an integer from 0 to QUICK_TAP_MAX. */
export const isValidQuickTapTerm = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= QUICK_TAP_MAX;

/** Return the term in a reply or backup entry, or null when it is not one. */
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

/** Return true when a restore must turn quick tap off, because the keyboard has it and the backup lacks it. */
export const needsQuickTapClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(QUICK_TAP_COMMAND) && !commands.includes(QUICK_TAP_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface QuickTapDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** Return the term on the keyboard, or null when it cannot be read. Never treat a failed read as off. */
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
    /* Replace the unsent value in the Device cache with the keyboard's, so a later backup does not record it */
    try {
      await device.noCacheCommand(QUICK_TAP_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* Skip the refresh, since the read-back already cached the keyboard's value */
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

/** Save the term from Preferences, which comes last before the post-save backup. Write a term that was read. Otherwise read it again,
 * so the Device cache holds the keyboard's term and not a failed reply, and throw when it still cannot be read. */
export const saveQuickTapTerm = async (device: QuickTapDevice, term: number): Promise<void> => {
  if (term >= 0) {
    await writeQuickTapTerm(device, term);
    return;
  }

  if ((await readQuickTapTerm(device)) === null) {
    throw new Error("Could not read the quick tap term");
  }
};
