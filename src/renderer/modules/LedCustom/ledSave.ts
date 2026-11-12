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

import {
  LedCustomDevice,
  LedCustomSlot,
  LedCustomState,
  LedRefSources,
  emptyLedTable,
  gcLedCustom,
  ledSlotRefs,
  readLedCustom,
  serializeLedCustom,
} from "../../../api/parsers/ledCustom";
import { parseCombosStrict } from "../../../api/parsers/combos";
import { parseAltRepeatRaw } from "../../../api/parsers/altRepeat";

/* What both editors' saves track of the custom LED effect slots. The table goes before the keymap, rules and combos that use it, and slots
 * nothing uses are freed after them. A slot the keyboard holds a key for, or may hold one for after a failed write, is protected, so an
 * edit never changes what a key on the keyboard plays. */

/** What the keyboard holds of the custom LED effects as far as the editor knows. Slots are table indexes. */
export interface LedSavedState {
  /* The serialized table on the keyboard, null when unknown */
  table: string | null;
  keymapRefs: number[];
  ruleRefs: number[];
  comboRefs: number[];
  /* Slots of a write that failed, which the keyboard may hold */
  uncertainKeymap: number[];
  uncertainRules: number[];
  uncertainCombos: number[];
}

export const EMPTY_LED_SAVED: LedSavedState = {
  table: null,
  keymapRefs: [],
  ruleRefs: [],
  comboRefs: [],
  uncertainKeymap: [],
  uncertainRules: [],
  uncertainCombos: [],
};

/** The sorted slots that the sources reference. */
export const ledRefSlots = (sources: LedRefSources): number[] => [...ledSlotRefs(sources)].sort((a, b) => a - b);

/** The saved state after reading the table, keymap, rules and combos from the keyboard uncached. */
export const withLedBaseline = (
  table: LedCustomSlot[],
  baseline: { layers: number[][]; rules: ReadonlyArray<{ output: number }>; combos: ReadonlyArray<{ action: number }> },
): LedSavedState => ({
  ...EMPTY_LED_SAVED,
  table: serializeLedCustom(table),
  keymapRefs: ledRefSlots({ layers: baseline.layers }),
  ruleRefs: ledRefSlots({ layers: [], rules: baseline.rules }),
  comboRefs: ledRefSlots({ layers: [], combos: baseline.combos }),
});

/** The slots the keyboard may play, which an edit must not change. */
export const protectedLedSlots = (saved: LedSavedState): Set<number> =>
  new Set([
    ...saved.keymapRefs,
    ...saved.ruleRefs,
    ...saved.comboRefs,
    ...saved.uncertainKeymap,
    ...saved.uncertainRules,
    ...saved.uncertainCombos,
  ]);

export const sortedUnion = (into: number[], slots: number[]): number[] => Array.from(new Set(into.concat(slots))).sort((a, b) => a - b);

/** The table with the slots that neither the draft nor the keyboard uses freed. Return `table` itself when nothing is freed. */
export const collectLedSlots = (table: LedCustomSlot[], draft: LedRefSources, saved: LedSavedState): LedCustomSlot[] =>
  gcLedCustom(table, new Set([...ledSlotRefs(draft), ...protectedLedSlots(saved)]));

/** Write the table when it differs from what the keyboard holds. Return the saved state after it, with an unknown table on failure. */
export const writeLedTable = async (
  write: (table: LedCustomSlot[]) => Promise<void>,
  table: LedCustomSlot[],
  saved: LedSavedState,
): Promise<{ saved: LedSavedState; wrote: boolean; error?: unknown }> => {
  const serialized = serializeLedCustom(table);

  if (serialized === saved.table) {
    return { saved, wrote: false };
  }

  try {
    await write(table);
  } catch (error) {
    return { saved: { ...saved, table: null }, wrote: false, error };
  }

  return { saved: { ...saved, table: serialized }, wrote: true };
};

/** The combos and rules the keyboard holds, from the serialized forms an editor keeps of them. Empty for an unknown or unreadable form */
export const keyboardLedSources = (
  savedCombos: string | null,
  savedRules: string | null,
): { combos: ReadonlyArray<{ action: number }>; rules: ReadonlyArray<{ output: number }> } => ({
  combos: parseCombosStrict(savedCombos) ?? [],
  rules: parseAltRepeatRaw(savedRules) ?? [],
});

/** The table and its state at an editor load. A table `help` lists that can not be read is "failed". */
export const loadLedTable = async (
  device: LedCustomDevice,
  listed: boolean,
): Promise<{ state: LedCustomState; table: LedCustomSlot[] }> => {
  if (!listed) {
    return { state: "unsupported", table: emptyLedTable() };
  }

  const table = await readLedCustom(device);
  return table === null ? { state: "failed", table: emptyLedTable() } : { state: "ready", table };
};
