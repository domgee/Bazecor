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

import type { LedCustomSlot } from "../../api/parsers/ledCustom";

/** The custom LED effect block in the Media and LED tab. Only the Layout editor cells and combo outputs pass it. */
export interface LedCustomPicker {
  /** The settings of the selected key's slot, null when it is no slot key or its slot is unused */
  current: LedCustomSlot | null;
  /** Give the key a slot with these settings. Return false when it was refused and nothing changed */
  onSelect: (settings: LedCustomSlot) => boolean;
  /** Why the block is off, as while a save runs */
  disabledReason?: string;
}
