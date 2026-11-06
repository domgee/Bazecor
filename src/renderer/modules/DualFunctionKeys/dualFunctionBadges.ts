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

import { PerKeyOverride, isOverrideEmpty } from "../../../api/parsers/dualFunction";

/* Put a "DF" chip in the top-right corner of every key with an override, built like the combo badge in KeyboardCanvas/comboBadges.ts.
 * An override applies on every layer, so the chips do not depend on the shown layer */

export const DUAL_FUNCTION_BADGE = "DF";

/** Static half of the badge inside `scope`, visible only once a generated rule supplies its content. */
export const dualFunctionBadgeBaseStyles = (scope: string): string => `
${scope} .keyContentLabel::after {
  position: absolute;
  top: -3px;
  right: -3px;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  line-height: 12px;
  letter-spacing: 0.02em;
  color: #fff;
  background: #e0570b;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
`;

/** One rule per key with an override, scoped to one view's container. */
export const dualFunctionBadgeStyles = (list: PerKeyOverride[], scope: string): string =>
  list
    .filter(o => !isOverrideEmpty(o))
    .map(o => `${scope} [data-key-index="${o.position}"] .keyContentLabel::after { content: "${DUAL_FUNCTION_BADGE}"; }`)
    .join("\n");
