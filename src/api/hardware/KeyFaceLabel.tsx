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

import React from "react";
import type { SlotLabels } from "../../lens/renderer/action-labels";
import { SILHOUETTE_HALF_W, superkeySlots } from "../../lens/renderer/key-label";

interface KeyFaceLabelProps {
  x: number | string;
  y: number | string;
  width: number;
  height: number;
  centerExtra: React.ReactNode;
  centerPrimary: React.ReactNode;
  /* The Multi-action slots the editor gives a Superkey or dual-function key, drawn as in Layer Lens */
  slots?: SlotLabels | null;
  /* A thumb or other irregular key, whose label box is wider than the face */
  silhouette?: boolean;
}

/** The label of a key face: the plain label, or the actions in the Layer Lens slots. The label div stays, since badges hang off it. */
function KeyFaceLabel({ x, y, width, height, centerExtra, centerPrimary, slots, silhouette = false }: KeyFaceLabelProps) {
  const halfW = silhouette ? Math.min(width / 2, SILHOUETTE_HALF_W) : width / 2;

  return (
    <foreignObject x={x} y={y} width={width} height={height}>
      <div xmlns="http://www.w3.org/1999/xhtml" className="keyContentLabel">
        {slots ? (
          <svg className="keyContentSlots" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {superkeySlots(width / 2, height / 2, halfW, slots, "currentColor")}
          </svg>
        ) : (
          <ul>
            <li className="extraLabel">{centerExtra}</li>
            <li className="labelClass">{centerPrimary}</li>
          </ul>
        )}
      </div>
    </foreignObject>
  );
}

export default KeyFaceLabel;
