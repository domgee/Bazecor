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

import { ALT_REPEAT_COMMAND, AltRepeatDevice, restoreAltRepeat } from "../parsers/altRepeat";
import { KEY_OVERRIDES_COMMAND, restoreKeyOverrides } from "../parsers/keyOverrides";

/** Restore one backup command. Validate and read back the tables whose rejection must fail the restore, and send the rest plain.
 * `keysPerLayer` runs only for the previous-key rules, so a plain command never needs the keyboard's layout. */
export const restoreCommand = async (
  device: AltRepeatDevice,
  command: string,
  data: string,
  keysPerLayer: () => number,
  sendPlain: () => Promise<unknown>,
): Promise<void> => {
  if (command === ALT_REPEAT_COMMAND) {
    await restoreAltRepeat(device, data, keysPerLayer());
    return;
  }

  if (command === KEY_OVERRIDES_COMMAND) {
    await restoreKeyOverrides(device, data);
    return;
  }

  await sendPlain();
};

export default restoreCommand;
