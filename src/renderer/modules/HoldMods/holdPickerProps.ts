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

import { HoldModsPicker, HoldModsState } from "@Renderer/types/holdMods";

export interface HoldPickerInput {
  /* A cell of the keymap, or the output of a previous-key rule */
  context: "cell" | "rule";
  layer: number;
  /* Firmware that plays layer holds as rule outputs */
  altRepeatLayerHold: boolean;
  state: HoldModsState;
  /* The table is ready and so are the rules, or the firmware has none */
  settled: boolean;
  heldMask: number;
  onHoldChange: (shortcut: number, held: number) => boolean;
}

export interface HoldPickerProps {
  allowLayerHold: boolean;
  holdMods?: HoldModsPicker;
}

/** The hold controls for a picker. The per-modifier row when settled, the single checkbox on firmware without the table, else none. */
export const holdPickerProps = (input: HoldPickerInput): HoldPickerProps => {
  const permitted = input.layer !== 0 && (input.context === "cell" || input.altRepeatLayerHold);

  if (!permitted) {
    return { allowLayerHold: false };
  }

  if (input.settled) {
    return { allowLayerHold: false, holdMods: { heldMask: input.heldMask, onHoldChange: input.onHoldChange } };
  }

  return { allowLayerHold: input.state === "unsupported" };
};
