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

import { LanguageType } from "../../api/keymap/types";
import { AltRepeatRule, AltRepeatState } from "./altRepeat";
import { KeyType, KeymapType } from "./layout";
import { MacroActionsType, MacrosType } from "./macros";
import { Neuron } from "./neurons";
import { SuperkeysType } from "./superkeys";

export interface MacroEditorProps {
  onDisconnect: () => void;
  startContext: () => void;
  cancelContext: () => void;
  setLoading: (lding: boolean) => void;
  saveButtonRef: React.RefObject<HTMLButtonElement>;
  discardChangesButtonRef: React.RefObject<HTMLButtonElement>;
}

export interface MacroEditorInitialStateType {
  keymap: KeymapType;
  macros: MacrosType[];
  superkeys: SuperkeysType[];
  storedMacros: MacrosType[];
  storedSuper: SuperkeysType[];
  neurons: Neuron[];
  neuronID: string;
  maxMacros: number;
  modified: boolean;
  selectedMacro: number;
  showDeleteModal: boolean;
  listToDelete: ListToDeleteType[];
  listToDeleteS: ListToDeleteSType[];
  listToDeleteM: ListToDeleteMType[];
  futureMacros: MacrosType[];
  selectedList: number;
  totalMemory: number;
  macrosEraser: string;
  loading: boolean;
  currentLanguageLayout: LanguageType;
  kbtype: string;
  scrollPos: number;
  altRepeatRules: AltRepeatRule[];
  /* Remember the table the keyboard holds so a save only writes a changed table */
  altRepeatSaved: string;
  altRepeatState: AltRepeatState;
  /* Remember the macro the delete modal is about so its confirmation can renumber rule outputs */
  deletedMacroIdx: number;
  /* The firmware plays macro options, the release marker and Unicode steps */
  macroUpgrade: boolean;
}

export interface ListToDeleteType {
  key: KeyType;
  newKey: number;
  layer: number;
  pos: number;
}

export interface ListToDeleteSType {
  action: number;
  newKey: number;
  superIdx: number;
  pos: number;
}

export interface ListToDeleteMType {
  actions: MacroActionsType[];
  newKey: number;
  macroIdx: number;
  pos: number;
}
