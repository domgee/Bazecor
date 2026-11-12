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

import {
  DUAL_FUNCTION_COMMAND,
  PER_KEY_COMMAND,
  parseDualFunctionGlobals,
  parsePerKeyOverrides,
} from "../../../api/parsers/dualFunction";
import { QUICK_TAP_COMMAND, parseQuickTapTerm } from "../../../api/parsers/quickTap";
import { ParsedSuperkeys, SUPERKEYS_COMMAND, parseSuperkeysTable } from "../../../api/parsers/superkeys";
import { LED_CUSTOM_COMMAND, parseLedCustomRaw } from "../../../api/parsers/ledCustom";

/* Decide whether the global settings the per-position options read for their previews can be backed up. A failed read leaves its reply in
 * the Device cache, and the backup after a save would record it */

export const HOLD_TIMEOUT_COMMAND = "qukeys.holdTimeout";
export const PRIOR_INTERVAL_COMMAND = "qukeys.minimumPriorInterval";

/** Return the number in a `qukeys.holdTimeout` or `qukeys.minimumPriorInterval` reply, or null when it holds none. */
export const parseGlobalNumber = (raw: unknown): number | null => {
  if (typeof raw !== "string" || !/^\s*\d+\s*$/.test(raw)) {
    return null;
  }

  return parseInt(raw, 10);
};

/** Return the commands read for its previews. Quick tap is read only when the firmware has it. */
export const previewCommands = (hasQuickTap: boolean): string[] => [
  HOLD_TIMEOUT_COMMAND,
  PRIOR_INTERVAL_COMMAND,
  ...(hasQuickTap ? [QUICK_TAP_COMMAND] : []),
  DUAL_FUNCTION_COMMAND,
];

/** Return true when `raw` is a reply the previews can use for `command`. */
export const isPreviewReadable = (command: string, raw: unknown): boolean => {
  if (command === QUICK_TAP_COMMAND) {
    return parseQuickTapTerm(raw) !== null;
  }

  if (command === DUAL_FUNCTION_COMMAND) {
    return parseDualFunctionGlobals(raw) !== null;
  }

  return parseGlobalNumber(raw) !== null;
};

/** Return the first command whose reply can not be used, or null when every reply can. */
export const firstUnreadable = (replies: { command: string; raw: unknown }[]): string | null =>
  replies.find(({ command, raw }) => !isPreviewReadable(command, raw))?.command ?? null;

export interface PreviewDevice {
  noCacheCommand(command: string): Promise<unknown>;
}

/** Read a global number uncached, and once more after a failure, because a failed reply stays in the Device cache and the backup records it. */
export const readGlobalNumber = async (device: PreviewDevice, command: string): Promise<number | null> => {
  const first = parseGlobalNumber(await device.noCacheCommand(command));

  if (first !== null) {
    return first;
  }

  return parseGlobalNumber(await device.noCacheCommand(command));
};

/** Mark a backup left out because a preview command still can not be read. The save itself stands. */
export class BackupSkippedError extends Error {
  command: string;

  constructor(command: string) {
    super(`${command} could not be read`);
    this.command = command;
  }
}

/** Read every preview command again uncached, so the backup records the keyboard's values and not a failed reply from the load. Return the
 * first command that still can not be read, or null. */
export const rereadPreviews = async (device: PreviewDevice, hasQuickTap: boolean): Promise<string | null> => {
  const replies: { command: string; raw: unknown }[] = [];

  for (const command of previewCommands(hasQuickTap)) {
    // eslint-disable-next-line no-await-in-loop
    replies.push({ command, raw: await device.noCacheCommand(command) });
  }

  return firstUnreadable(replies);
};

/** The Superkey table read uncached with one retry, or null. A failed reply stays in the cache, so a backup must follow a good read */
export const rereadSuperkeys = async (device: PreviewDevice): Promise<ParsedSuperkeys | null> =>
  parseSuperkeysTable(await device.noCacheCommand(SUPERKEYS_COMMAND)) ?? parseSuperkeysTable(await device.noCacheCommand(SUPERKEYS_COMMAND));

/** The custom LED effects read uncached with one retry, or null */
export const rereadLedCustom = async (device: PreviewDevice) =>
  parseLedCustomRaw(await device.noCacheCommand(LED_CUSTOM_COMMAND)) ?? parseLedCustomRaw(await device.noCacheCommand(LED_CUSTOM_COMMAND));

/** Read again uncached what a backup would record from a failed reply: the previews when `previews`, qukeys.perKey when `perKey`, since
 * its load failed, superkeys.map when `superkeys` and led.custom when `ledCustom`. Return the first command that still can not be read, or
 * null when the backup may run. */
export const unreadableBeforeBackup = async (
  device: PreviewDevice,
  checks: { previews: boolean; hasQuickTap: boolean; perKey: boolean; superkeys?: boolean; ledCustom?: boolean },
): Promise<string | null> => {
  if (checks.previews) {
    const unreadable = await rereadPreviews(device, checks.hasQuickTap);

    if (unreadable !== null) {
      return unreadable;
    }
  }

  if (checks.perKey && parsePerKeyOverrides(await device.noCacheCommand(PER_KEY_COMMAND)) === null) {
    return PER_KEY_COMMAND;
  }

  if (checks.superkeys && (await rereadSuperkeys(device)) === null) {
    return SUPERKEYS_COMMAND;
  }

  if (checks.ledCustom && (await rereadLedCustom(device)) === null) {
    return LED_CUSTOM_COMMAND;
  }

  return null;
};
