/* bazecor-keymap -- Bazecor keymap library
 * Copyright (C) 2026  DygmaLab SE
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
import { SwapHandsCodes } from "../../../hw/swaphands";

/* The four swap control keys. The "swap on hold, key on tap" range is derived from the base keys at runtime in KeymapDB */
const SwapHandsTable = {
  groupName: "SwapHands",
  keys: [
    {
      code: SwapHandsCodes.SWAP_HANDS_MON,
      labels: {
        top: "SWAP",
        primary: "HOLD",
        verbose: "Swap hands while held",
      },
    },
    {
      code: SwapHandsCodes.SWAP_HANDS_TOGGLE,
      labels: {
        top: "SWAP",
        primary: "TOGG",
        verbose: "Swap hands toggle",
      },
    },
    {
      code: SwapHandsCodes.SWAP_HANDS_TAP_TOGGLE,
      labels: {
        top: "SWAP",
        primary: "TT",
        verbose: "Swap hands tap-toggle",
      },
    },
    {
      code: SwapHandsCodes.SWAP_HANDS_ONESHOT,
      labels: {
        top: "SWAP",
        primary: "ONE",
        verbose: "Swap hands one-shot",
      },
    },
  ],
};

export default SwapHandsTable;
export { SwapHandsTable };
