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

import { DUAL_FUNCTION_COMMAND, parseDualFunctionGlobals } from "../../../api/parsers/dualFunction";
import { QUICK_TAP_COMMAND, parseQuickTapTerm } from "../../../api/parsers/quickTap";

/* Decide whether the global settings the Dual-function Keys page reads for its previews can be backed up. A failed read leaves its reply in
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

/** Return the commands the page reads for its previews. Quick tap is read only when the firmware has it. */
export const previewCommands = (hasQuickTap: boolean): string[] => [
  HOLD_TIMEOUT_COMMAND,
  PRIOR_INTERVAL_COMMAND,
  ...(hasQuickTap ? [QUICK_TAP_COMMAND] : []),
  DUAL_FUNCTION_COMMAND,
];

/** Return true when `raw` is a reply the page can use for `command`. */
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
