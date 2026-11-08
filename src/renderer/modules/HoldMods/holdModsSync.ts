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

import { HoldModsState } from "@Renderer/types/holdMods";

/* Keep table loads and saves in the Layout editor apart.
 *
 * A load reads the keyboard's baseline and a save writes the keyboard and then stores what it may hold. When both overlap, the one that
 * finishes last would overwrite the other's view with an older one. A save therefore drops a load in flight and defers loads asked for
 * while it runs, and the editor loads again once the save is over.
 */

export interface HoldModsSync {
  /* Start a load. Null when a save runs, which defers the load until the save ends */
  beginLoad: () => { load: number; edits: number } | null;
  /* True when the load may apply its result. Count each applied load */
  finishLoad: (token: { load: number; edits: number }) => boolean;
  loading: () => boolean;
  edited: () => void;
  /* Start a save and drop any load in flight */
  beginSave: () => number;
  /* True when a load applied after `beginSave`, so the save must not store its own view */
  loadAppliedSince: (save: number) => boolean;
  /* End the save. True when a load was dropped or deferred and must run now */
  endSave: () => boolean;
}

export const createHoldModsSync = (): HoldModsSync => {
  let loads = 0;
  let edits = 0;
  let applied = 0;
  let inFlight = false;
  let saving = false;
  let deferred = false;

  return {
    beginLoad: () => {
      if (saving) {
        deferred = true;
        return null;
      }

      loads += 1;
      inFlight = true;
      return { load: loads, edits };
    },
    finishLoad: token => {
      if (token.load !== loads) {
        return false;
      }

      inFlight = false;

      if (token.edits !== edits) {
        return false;
      }

      applied += 1;
      return true;
    },
    loading: () => inFlight,
    edited: () => {
      edits += 1;
    },
    beginSave: () => {
      if (inFlight) {
        loads += 1;
        inFlight = false;
        deferred = true;
      }

      saving = true;
      return applied;
    },
    loadAppliedSince: save => applied !== save,
    endSave: () => {
      const reload = deferred;
      saving = false;
      deferred = false;
      return reload;
    },
  };
};

/** Retry a table load on a key pick while it could not read the keyboard or the table, but not while one runs. */
export const holdModsRetryWanted = (state: HoldModsState, keyIndex: number, loading: boolean): boolean =>
  keyIndex !== -1 && (state === "loading" || state === "failed") && !loading;

/** True when the editor's own `help` read lists the rules that App's capability check missed, so the rules must load too. */
export const altRepeatMissed = (helpListsAltRepeat: boolean, capability: unknown): boolean => helpListsAltRepeat && !capability;
