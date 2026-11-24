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

import { SuperkeysType } from "@Renderer/types/superkeys";
import { DominantEntry, dominantRefusal, dominantTarget } from "../../../api/parsers/dominant";

/* Put an "L2" chip on the right edge, centred vertically, of every layer-1 key with a dominant layer. The other corners are taken by the
 * previous-key badge (top left), the combo badge (top right) and the modifier chips (bottom row). Both pseudo-elements of the label div are
 * taken too, so the chip hangs off the `.keyFaceBadge` span KeyFaceLabel renders. Offset the chip by half its line height instead of a
 * transform, since the canvas styles give every element in the label a transform */

/** Static half of the badge, visible only once a generated rule supplies its content. */
export const dominantBadgeBaseStyles = `
.keyFaceBadge {
  position: absolute;
  top: 50%;
  right: -3px;
  width: 0;
  height: 0;
  pointer-events: none;
}
.keyFaceBadge::after {
  position: absolute;
  top: -6px;
  right: 0;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  line-height: 12px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: #fff;
  background: #e5770b;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
}
`;

export interface DominantBadgeView {
  /* The firmware layer the editor shows */
  layer: number;
  onlyCustom: boolean;
  /* The key codes of every firmware layer by position */
  layers: number[][];
  superkeys: SuperkeysType[];
}

/** The badge text per position, "L<n>" with the layer as Bazecor numbers it. Only on layer 0 with onlyCustom, and never on an entry the
 * firmware ignores, for a layer-changing cell or a Transparent or swap hands cell on the dominant layer. */
export const dominantBadgeLabels = (list: DominantEntry[], view: DominantBadgeView): Map<number, string> => {
  const labels = new Map<number, string>();

  if (view.layer !== 0 || !view.onlyCustom) {
    return labels;
  }

  list.forEach(({ position, layer }) => {
    const code = view.layers[0]?.[position];

    if (code !== undefined && !dominantRefusal(code, view.superkeys) && dominantTarget(view.layers[layer]?.[position]) === "active") {
      labels.set(position, `L${layer + 1}`);
    }
  });

  return labels;
};

/** One rule per badged key, scoped to one view's container. */
export const dominantBadgeStyles = (list: DominantEntry[], view: DominantBadgeView, scope = ".layoutEditor"): string => {
  const styles: string[] = [];

  dominantBadgeLabels(list, view).forEach((label, position) => {
    styles.push(`${scope} [data-key-index="${position}"] .keyFaceBadge::after { content: "${label}"; }`);
  });

  return styles.join("\n");
};
