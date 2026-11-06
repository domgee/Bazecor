/* Bazecor
 * Copyright (C) 2024  DygmaLab SE.
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

/* Play mode 0 plays once, 1 repeats while the key is held, 2 loops from one tap to the next */
export interface MacroOptions {
  mode: 0 | 1 | 2;
  ignoreMods: boolean;
  otherKeysStop: boolean;
}

export interface MacrosType {
  actions: MacroActionsType[];
  id?: number;
  name: string;
  macro: string;
  /* Undefined for a classic macro, which the firmware plays once without masking modifiers or stopping on other keys */
  options?: MacroOptions;
}

/* keyCode is [min, max] for a random delay, the keys of a tap sequence, 0 for steps without a payload and the code point for Unicode */
export interface MacroActionsType {
  keyCode: number | number[];
  type: number;
  id?: number;
}

export type MacroEAType = {
  enum: string;
  name: string;
  id?: number;
  icon?: string | JSX.Element;
  smallIcon?: string | JSX.Element;
};

export type MacroModType = {
  id: number;
  name: string;
  keyCode: number;
  color: string;
};

export interface RowsRepresentation {
  symbol: string | JSX.Element;
  keyCode: number | number[];
  type: number;
  id: number;
  uid: number;
  color: string;
  ucolor: string;
}
