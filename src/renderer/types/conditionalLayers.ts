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

/** A conditional layer rule. While every if-layer is on, the then-layer is on too. */
export interface ConditionalLayerRule {
  /** Bit n is firmware layer n, layers 0-9, two or more bits. */
  ifMask: number;
  /** Firmware layer 0-9, not one of the if-layers. */
  thenLayer: number;
}

/** "failed" means the firmware has the command but its rules could not be read. */
export type ConditionalLayersState = "unsupported" | "ready" | "failed";

export interface ConditionalLayersEditorProps {
  onDisconnect: () => void;
  startContext: () => void;
  cancelContext: () => void;
  setLoading: (loading: boolean) => void;
  saveButtonRef?: React.RefObject<HTMLButtonElement>;
  discardChangesButtonRef?: React.RefObject<HTMLButtonElement>;
}
