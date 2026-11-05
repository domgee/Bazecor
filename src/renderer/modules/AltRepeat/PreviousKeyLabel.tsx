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
import { KeymapDB } from "../../../api/keymap";
import { previousModifiers } from "../../../api/parsers/altRepeat";

const MODIFIER_NAMES = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  gui: process.platform === "darwin" ? "Cmd" : "Win",
};

interface PreviousKeyLabelProps {
  code: number;
  keymapDB: KeymapDB;
}

/* KeymapDB labels a shortcut by its base key only, so name the modifiers here to tell `c` and Cmd+c apart */
const PreviousKeyLabel = ({ code, keymapDB }: PreviousKeyLabelProps) => (
  <span className="previousKeyLabel inline-flex items-center gap-0.5">
    {previousModifiers(code).map(mod => (
      <span key={mod}>{`${MODIFIER_NAMES[mod]}+`}</span>
    ))}
    <KeyLabel keyData={keymapDB.parse(code & 0xff)} />
  </span>
);

export default PreviousKeyLabel;
