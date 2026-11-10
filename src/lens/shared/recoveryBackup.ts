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

/** The suffix of a backup taken before the Layout editor removes unused Superkeys */
export const RECOVERY_BACKUP_SUFFIX = "-before-cleanup";

/** True for a recovery backup file, which only a manual restore may pick */
export const isRecoveryBackupFile = (file: string): boolean => /-before-cleanup(-\d+)?\.json$/i.test(file);
