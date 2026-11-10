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

import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { isAllowedOutput } from "./altRepeat";
import {
  LayoutRefs,
  SuperkeyProtection,
  SuperkeySource,
  cloneSuperkeyRefs,
  protectedSlots,
  remapFileSuperkeys,
  superkeyRefs,
  superkeySlot,
} from "./multiAction";
import { MAX_ACTIVE_SUPERKEYS, SUPERKEY_FIRST, isIdleSuperkey, normalizeActions } from "./superkeys";

/* Superkeys in layer copies, layer files and new previous-key tabs. Every copy gets its own slots, so keys never start sharing one */

const FALLBACK_OUTPUT = 4;
const MAX_ACTION = 65535;

export interface ExportedSuperkey {
  code: number;
  actions: number[];
}

export const hasSuperkeyRef = (codes: number[]): boolean => codes.some(code => superkeySlot(code) !== null);

/** The slots a copy may not take, which are what the rest of the draft references, what the keyboard may still play and what it holds. */
export const transferUsed = (refs: LayoutRefs, protection: SuperkeyProtection, held: Iterable<number>): Set<number> =>
  new Set([...superkeyRefs(refs).keys(), ...protectedSlots(protection), ...held]);

/** The Superkeys `codes` reference, for a layer file. Undefined, idle and beyond-limit slots are left out. */
export const exportSuperkeys = (codes: number[], table: ReadonlyArray<ReadonlyArray<number>>): ExportedSuperkey[] => {
  const slots = new Set<number>();

  codes.forEach(code => {
    const slot = superkeySlot(code);

    if (slot !== null && slot < MAX_ACTIVE_SUPERKEYS && slot < table.length && !isIdleSuperkey(table[slot])) {
      slots.add(slot);
    }
  });

  return [...slots].sort((a, b) => a - b).map(slot => ({ code: SUPERKEY_FIRST + slot, actions: normalizeActions(table[slot]) }));
};

const validActions = (actions: unknown): actions is number[] =>
  Array.isArray(actions) &&
  actions.length <= 5 &&
  actions.every(action => Number.isInteger(action) && (action as number) >= 0 && (action as number) <= MAX_ACTION);

/** A file's Superkey definitions by slot, or null when it has none. Reads `{ code, actions }` entries and the old `{ actions }` table. */
export const fileSuperkeySource = (raw: unknown): SuperkeySource | null => {
  if (!Array.isArray(raw)) {
    return null;
  }

  const source: (number[] | undefined)[] = [];

  raw.forEach((entry, index) => {
    const { code, actions } = (entry ?? {}) as { code?: unknown; actions?: unknown };
    let slot: number | null = index;

    if (code !== undefined) {
      slot = typeof code === "number" ? superkeySlot(code) : null;
    }

    /* Count slots at or above 70 as undefined, since the keyboard never plays them */
    if (slot !== null && slot < MAX_ACTIVE_SUPERKEYS && validActions(actions)) {
      source[slot] = normalizeActions(actions);
    }
  });

  return source;
};

/** Where a layer file's Superkeys come from. An old file without them takes the keyboard's own when it is for the same product. */
export const layerFileSource = (fileSuperkeys: unknown, sameProduct: boolean, current: SuperkeySource): SuperkeySource =>
  fileSuperkeySource(fileSuperkeys) ?? (sameProduct ? current : []);

export type TransferResult =
  | { cells: number[][]; rules: AltRepeatRule[]; table: number[][]; missing: number }
  | { error: "capacity" };

/* Put the cloned codes back in their lists. Drop a rule whose Superkey is missing, since a tab needs an output */
const split = (lists: number[][], cells: number[][], rules: AltRepeatRule[], missingRules: Set<number>) => ({
  cells: lists.slice(0, cells.length),
  rules: rules.flatMap((rule, i) => (missingRules.has(i) ? [] : [{ ...rule, output: lists[cells.length][i] }])),
});

/** Give every Superkey occurrence in copied or imported layers and rules its own new slot, or change nothing on capacity. */
export const cloneLayerSuperkeys = ({
  cells,
  rules,
  sourceTable,
  table,
  used,
}: {
  cells: number[][];
  rules: AltRepeatRule[];
  sourceTable: SuperkeySource;
  table: number[][];
  used: Set<number>;
}): TransferResult => {
  const flat = [...cells.flat(), ...rules.map(rule => rule.output)];
  const cloned = cloneSuperkeyRefs(flat, sourceTable, table, used);

  if ("error" in cloned) {
    return cloned;
  }

  const lists: number[][] = [];
  let offset = 0;

  [...cells, rules].forEach(list => {
    lists.push(cloned.codes.slice(offset, offset + list.length));
    offset += list.length;
  });

  const cellCount = cells.reduce((sum, list) => sum + list.length, 0);
  const missingRules = new Set(cloned.missing.filter(index => index >= cellCount).map(index => index - cellCount));
  return { ...split(lists, cells, rules, missingRules), table: cloned.table, missing: cloned.missing.length };
};

/** Give every file slot that a full-layout import references one new slot, so the file's own sharing stays. */
export const remapLayoutSuperkeys = ({
  cells,
  rules,
  fileTable,
  table,
  used,
}: {
  cells: number[][];
  rules: AltRepeatRule[];
  fileTable: SuperkeySource;
  table: number[][];
  used: Set<number>;
}): TransferResult => {
  const remapped = remapFileSuperkeys([...cells, rules.map(rule => rule.output)], fileTable, table, used);

  if ("error" in remapped) {
    return remapped;
  }

  const missingRules = new Set(remapped.missing.filter(({ list }) => list === cells.length).map(({ index }) => index));
  return { ...split(remapped.lists, cells, rules, missingRules), table: remapped.table, missing: remapped.missing.length };
};

export type RuleOutputFallback = "capacity" | "blocked" | null;

/** The output of a new previous-key tab started from the key's default. A Superkey default gets its own copy. */
export const ruleOutputFromDefault = (
  defaultCode: number,
  table: number[][],
  used: Set<number> | null,
): { output: number; table: number[][]; fallback: RuleOutputFallback } => {
  const slot = superkeySlot(defaultCode);

  if (slot === null) {
    return { output: isAllowedOutput(defaultCode) ? defaultCode : FALLBACK_OUTPUT, table, fallback: null };
  }

  const defined = slot < MAX_ACTIVE_SUPERKEYS && slot < table.length && !isIdleSuperkey(table[slot]);

  if (!defined) {
    return { output: FALLBACK_OUTPUT, table, fallback: null };
  }

  if (used !== null) {
    const cloned = cloneSuperkeyRefs([defaultCode], table, table, used);

    if (!("error" in cloned)) {
      return { output: cloned.codes[0], table: cloned.table, fallback: null };
    }
  }

  /* Start from the Tap when no copy can be made */
  const [tap] = normalizeActions(table[slot]);
  const output = tap !== 1 && isAllowedOutput(tap) ? tap : FALLBACK_OUTPUT;
  return { output, table, fallback: used === null ? "blocked" : "capacity" };
};
