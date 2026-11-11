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

/** A previous-key rule. The key at `position` on `layer` sends `output` when the key typed before it was `previous`. */
export interface AltRepeatRule {
  /** Firmware layer index, the layer that owns the key. */
  layer: number;
  /** Physical key offset, KeyAddr::toInt(). */
  position: number;
  /** Ctrl 0x100, Alt 0x200, Shift 0x800 and Gui 0x1000 flags plus a keycode 0x04..0xDD, and 0x8000 to apply on key repeat. */
  previous: number;
  /** Raw Bazecor keycode. */
  output: number;
}

/** "failed" means the firmware has the command but its rules could not be read. */
export type AltRepeatState = "unsupported" | "ready" | "failed";

/** Why a key's default keeps it from having previous-key rules. */
export type AltRepeatBlock = "transparent" | "autoshift" | "capsword" | "unsupported" | "superkey" | "swaphands" | "repeatkey";

/** A previous-key rule as a single-layer export stores it. */
export interface AltRepeatLayerEntry {
  position: number;
  previous: number;
  output: number;
}
