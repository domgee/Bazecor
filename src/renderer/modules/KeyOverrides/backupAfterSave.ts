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

/** Back up after a save. A real keyboard already holds the save, so only report a failed backup to `onIgnored`. A virtual keyboard
 * keeps the save only in the file the backup writes, so its failure fails the save. */
export const backupAfterSave = async (
  isVirtual: boolean,
  runBackup: () => Promise<void>,
  onIgnored: (error: unknown) => void,
): Promise<void> => {
  try {
    await runBackup();
  } catch (error) {
    if (isVirtual) {
      throw error;
    }

    onIgnored(error);
  }
};

export default backupAfterSave;
