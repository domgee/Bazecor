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
import { KeyType } from "@Renderer/types/layout";
import { LED_TYPE_SOLID, LedCustomSlot, ledSlotOf, ledTypeName } from "../../../api/parsers/ledCustom";

/** The key-face label of a custom LED effect key: its type, with a dot in the colour for Solid. Null when the code is no slot key or the
 * slot is unused, so the static SLOT n label stays. */
export const ledKeyLabel = (code: number, table: ReadonlyArray<LedCustomSlot> | null): string | JSX.Element | null => {
  const slot = ledSlotOf(code);
  const entry = slot === null || table === null ? undefined : table[slot];
  const name = entry === undefined ? null : ledTypeName(entry.type);

  if (entry === undefined || name === null) {
    return null;
  }

  if (entry.type !== LED_TYPE_SOLID) {
    return name;
  }

  return (
    <span className="inline-flex items-center gap-[3px]">
      <span
        className="inline-block w-[7px] h-[7px] rounded-full border border-white/60"
        style={{ background: `rgb(${entry.r}, ${entry.g}, ${entry.b})` }}
      />
      {name}
    </span>
  );
};

/** The key with its custom LED effect label, or the key itself for any other code. */
export const withLedLabel = (key: KeyType, table: ReadonlyArray<LedCustomSlot> | null): KeyType => {
  const label = key ? ledKeyLabel(key.keyCode, table) : null;
  return label === null ? key : { ...key, label };
};
