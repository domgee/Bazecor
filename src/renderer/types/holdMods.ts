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

/** A `holdmods.map` entry. The partial hold `code` holds the modifiers in `held`, Ctrl 1, Alt 2, AltGr 4, Shift 8, Gui 16. */
export interface HoldModsEntry {
  code: number;
  held: number;
}

/** "loading" also covers an unreadable `help`. "failed" means the firmware lists the table but it could not be read. */
export type HoldModsState = "loading" | "unsupported" | "ready" | "failed";

/** What a restore knows about the target's `help`, read once per restore. Only "listed" has the table. */
export type HoldModsTarget = "listed" | "unlisted" | "unreadable";

/** The per-modifier row in ModPicker. `onHoldChange` returns false when the change was refused and nothing changed. */
export interface HoldModsPicker {
  heldMask: number;
  onHoldChange: (shortcut: number, held: number) => boolean;
}
