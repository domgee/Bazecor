/* eslint-disable no-bitwise */
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
import KeyLabel from "@Renderer/components/molecules/KeyTags/KeyLabel";
import ListModifier from "@Renderer/components/molecules/ListModifiers/ListModifiers";
import { i18n } from "@Renderer/i18n";
import { KeymapDB } from "../../../api/keymap";

interface ReplacementLabelProps {
  code: number;
  keymapDB: KeymapDB;
}

/* Show the modifiers as the same badges the Combo Editor uses, since KeymapDB labels a shortcut by its base key only */
const ReplacementLabel = ({ code, keymapDB }: ReplacementLabelProps) => {
  if (code === 0) {
    return <span className="replacementLabel font-semibold">{i18n.editor.keyOverrides.block}</span>;
  }

  return (
    <span className="replacementLabel inline-flex flex-col items-center gap-0.5">
      <KeyLabel keyData={keymapDB.parse(code & 0xff)} />
      <ListModifier keyCode={code} size="xs" />
    </span>
  );
};

export default ReplacementLabel;
