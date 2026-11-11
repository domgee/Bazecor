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
import { RepeatKeyCodes } from "../../../hw/repeatkey";

/* Leave out a top label, since KeyLabel shows only a React element there and the primary must name the key on its own */
const RepeatKeyTable = {
  groupName: "RepeatKey",
  keys: [
    {
      code: RepeatKeyCodes.REPEAT_KEY,
      labels: {
        primary: "REPEAT",
        verbose: "Repeat last key",
      },
    },
  ],
};

export default RepeatKeyTable;
export { RepeatKeyTable };
