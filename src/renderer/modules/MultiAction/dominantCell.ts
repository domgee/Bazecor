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

import { i18n } from "@Renderer/i18n";
import { DualFunctionKeysState } from "@Renderer/types/dualFunctionKeys";
import { isSuperkeyCode } from "../../../api/parsers/superkeys";

/* The Layout editor's decisions for the dominant layer of the selected cell */

export interface DominantBlockInput {
  state: DualFunctionKeysState;
  /* False when the keymap replies could not be read, since a save would then write a fallback keymap */
  keymapKnown: boolean;
  superkeysFailed: boolean;
  altRepeatFailed: boolean;
  holdModsFailed: boolean;
  /* The cell's code on layer 1 */
  cellCode: number;
}

/** Why the dominant layer of the cell can't be edited, or undefined when it can. A Superkey needs the table, since its hold decides
 * whether the cell changes the layer. */
export const dominantBlock = (input: DominantBlockInput): string | undefined => {
  if (input.state === "failed") {
    return i18n.editor.multiAction.dominantUnreadable;
  }

  if (!input.keymapKnown) {
    return i18n.editor.multiAction.dominantKeymapUnknown;
  }

  if (input.superkeysFailed && isSuperkeyCode(input.cellCode)) {
    return i18n.editor.multiAction.dominantSuperkeysUnknown;
  }

  if (input.altRepeatFailed) {
    return i18n.editor.altRepeat.loadFailed;
  }

  return input.holdModsFailed ? i18n.editor.holdMods.loadFailed : undefined;
};

/** Decide a capabilities refresh. A refresh during a save stays pending, so it is reconciled once the save ends. Return the refresh count
 * to mark as seen and the action to take. */
export const dominantRefreshStep = (input: {
  refresh: number;
  seen: number;
  saving: boolean;
  listed: boolean;
  state: DualFunctionKeysState;
}): { seen: number; action: "load" | "unsupported" | null } => {
  if (input.refresh === input.seen || input.saving) {
    return { seen: input.seen, action: null };
  }

  return { seen: input.refresh, action: dominantRefreshAction(input.listed, input.state) };
};

/** What to do when App reads the capabilities again. "load" when support appeared or the last load failed, "unsupported" when it went
 * away, and null while the editor agrees with the keyboard, so an edited draft stays. */
export const dominantRefreshAction = (listed: boolean, state: DualFunctionKeysState): "load" | "unsupported" | null => {
  if (!listed) {
    return state === "unsupported" ? null : "unsupported";
  }

  return state === "ready" ? null : "load";
};
