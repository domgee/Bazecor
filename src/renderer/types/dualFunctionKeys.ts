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

import { DualFunctionGlobals } from "../../api/parsers/dualFunction";

/** "failed" means the firmware has the commands but the overrides could not be read. */
export type DualFunctionKeysState = "unsupported" | "ready" | "failed";

/** The global settings a key uses when its field is left on "Use global". Null means it could not be read. */
export interface DualFunctionGlobalPreview {
  holdTimeout: number | null;
  quickTapTerm: number | null;
  priorInterval: number | null;
  options: DualFunctionGlobals | null;
}
