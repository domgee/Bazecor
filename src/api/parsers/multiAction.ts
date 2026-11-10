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

import { AltRepeatBlock, AltRepeatRule } from "@Renderer/types/altRepeat";
import { COMBO_POSITION_UNUSED, ComboType } from "@Renderer/types/combos";
import { SuperkeysType } from "@Renderer/types/superkeys";
import {
  DU_FIRST,
  DU_LAST,
  altRepeatDefaultBlock,
  decodeDualUse,
  dualUseCodeFor,
  isAllowedOutput,
  basePrevious,
  isDualFunctionSuperkey,
  isRegisteredQukeySuperkey,
  rulesAt,
  superkeyQukeyCode,
} from "./altRepeat";
import { ComboBreakReason, comboBreakReason, combosAtPosition } from "./combos";
import { autoshiftBaseCode, isAutoshift } from "../../hw/autoshift";
import { holdShortcut, isHoldCode } from "../../hw/layerhold";
import { OverlayCodes } from "../../hw/overlay";
import { isSwapHandsCode } from "../../hw/swaphands";
import {
  IDLE_ACTIONS,
  MAX_ACTIVE_SUPERKEYS,
  SUPERKEY_FIRST,
  SuperkeyWriteFormat,
  isIdleSuperkey,
  isSuperkeyCode,
  normalizeActions,
} from "./superkeys";

/* Pure helpers for the Multi-action tab: Superkey references, slot allocation, garbage collection and qukey collisions.
 *
 * Keys never share Superkeys by choice. A new definition takes the lowest slot that no draft reference and no keyboard state uses.
 * Slots are stable and never renumbered.
 */

export type SkRef =
  | { kind: "cell"; layer: number; position: number; custom: boolean }
  | { kind: "rule"; index: number }
  | { kind: "combo"; index: number };

/** Everything that can reference a Superkey. Layers are numbered as the firmware numbers them. */
export interface LayoutRefs {
  customLayers: number[][];
  /** The default layers the firmware runs, empty when only custom layers are on */
  defaultLayers: number[][];
  /** The firmware layer of custom layer 0 */
  layerOffset: number;
  rules: AltRepeatRule[];
  /** Combos by index. Only the output, the layer and the members matter here */
  combos: ComboRef[];
}

export type ComboRef = Pick<ComboType, "layer" | "positions" | "action">;

export interface SuperkeyDraft extends LayoutRefs {
  table: number[][];
}

/** Slots the keyboard still references through data that is saved there, or whose save is uncertain. */
export interface SuperkeyProtection {
  keymapRefs?: number[];
  ruleRefs?: number[];
  comboRefs?: number[];
  uncertainKeymap?: number[];
  uncertainRules?: number[];
  uncertainCombos?: number[];
}

export const superkeySlot = (code: number): number | null => (isSuperkeyCode(code) ? code - SUPERKEY_FIRST : null);

export const actionsKey = (actions: ReadonlyArray<number | undefined | null> | undefined): string => normalizeActions(actions).join(",");

const asSuperkeys = (table: ReadonlyArray<ReadonlyArray<number>>): SuperkeysType[] =>
  table.map((actions, id) => ({ actions: [...actions], name: "", id }));

const sameRef = (a: SkRef, b: SkRef): boolean => {
  if (a.kind === "cell" && b.kind === "cell") {
    return a.layer === b.layer && a.position === b.position;
  }

  if (a.kind === "rule" && b.kind === "rule") {
    return a.index === b.index;
  }

  if (a.kind === "combo" && b.kind === "combo") {
    return a.index === b.index;
  }

  return false;
};

const addRef = (refs: Map<number, SkRef[]>, code: number, ref: SkRef) => {
  const slot = superkeySlot(code);

  if (slot === null) {
    return;
  }

  refs.set(slot, [...(refs.get(slot) ?? []), ref]);
};

const forEachCell = (input: LayoutRefs, visit: (code: number, ref: SkRef & { kind: "cell" }) => void) => {
  input.defaultLayers.forEach((codes, layer) => {
    codes.forEach((code, position) => {
      visit(code, { kind: "cell", layer, position, custom: false });
    });
  });

  input.customLayers.forEach((codes, index) => {
    codes.forEach((code, position) => {
      visit(code, { kind: "cell", layer: index + input.layerOffset, position, custom: true });
    });
  });
};

/** Every reference to each Superkey slot, from keymap cells, previous-key rules and combo outputs. */
export const superkeyRefs = (input: LayoutRefs): Map<number, SkRef[]> => {
  const refs = new Map<number, SkRef[]>();

  forEachCell(input, (code, ref) => {
    addRef(refs, code, ref);
  });

  input.rules.forEach((rule, index) => {
    addRef(refs, rule.output, { kind: "rule", index });
  });

  input.combos.forEach((combo, index) => {
    addRef(refs, combo.action, { kind: "combo", index });
  });

  return refs;
};

/** The protected slots: what the keyboard holds and what may have reached it. */
export const protectedSlots = (protection: SuperkeyProtection): Set<number> =>
  new Set([
    ...(protection.keymapRefs ?? []),
    ...(protection.ruleRefs ?? []),
    ...(protection.comboRefs ?? []),
    ...(protection.uncertainKeymap ?? []),
    ...(protection.uncertainRules ?? []),
    ...(protection.uncertainCombos ?? []),
  ]);

/** The lowest slot below 70 that `used` leaves free, or null. */
export const freeSlot = (used: Set<number>): number | null => {
  for (let slot = 0; slot < MAX_ACTIVE_SUPERKEYS; slot += 1) {
    if (!used.has(slot)) {
      return slot;
    }
  }

  return null;
};

/* A copy of `table` with `actions` in `slot`. Fill a gap before it with idle rows */
const withRow = (table: ReadonlyArray<ReadonlyArray<number>>, slot: number, actions: number[]): number[][] => {
  const next = table.map(row => [...row]);

  while (next.length < slot) {
    next.push([...IDLE_ACTIONS]);
  }

  next[slot] = [...actions];
  return next;
};

const refSlots = (refs: Map<number, SkRef[]>): number[] => [...refs.entries()].filter(([, list]) => list.length > 0).map(([slot]) => slot);

const hasOtherRef = (refs: Map<number, SkRef[]>, slot: number, target: SkRef) =>
  (refs.get(slot) ?? []).some(ref => !sameRef(ref, target));

/* ------------------------------------------------------------------------ */
/* Edits                                                                    */
/* ------------------------------------------------------------------------ */

export interface MultiActionState {
  table: number[][];
  /** The draft's references, the target's own included */
  refs: Map<number, SkRef[]>;
  protectedSlots: Set<number>;
  /** What the target holds now */
  currentCode: number;
  /** The slot the target's own cell held when the layout was loaded */
  ownBaselineSlot?: number;
  /** Slots the keyboard holds a definition in, referenced or not. A new Superkey never takes one */
  heldSlots?: Set<number>;
}

export type MultiActionResult = { table: number[][]; code: number } | { error: "capacity" | "emptyRule" };

/** The code and table after setting the five actions of a Multi-action on `target`. */
export const applyMultiAction = (
  state: MultiActionState,
  target: SkRef,
  actions: ReadonlyArray<number | undefined | null>,
): MultiActionResult => {
  const normalized = normalizeActions(actions);
  const current = superkeySlot(state.currentCode);
  /* Treat a Superkey at or above 70 as a plain key. The firmware never runs it */
  const editable = current !== null && current < MAX_ACTIVE_SUPERKEYS ? current : null;
  const isIdle = (action: number) => action === 1;
  const [tap, hold, ...rest] = normalized;

  /* Edit a shared Superkey in place, so every key that uses it follows */
  if (editable !== null && hasOtherRef(state.refs, editable, target)) {
    return { table: withRow(state.table, editable, normalized), code: state.currentCode };
  }

  if (normalized.every(isIdle)) {
    return target.kind === "rule" ? { error: "emptyRule" } : { table: state.table, code: 0 };
  }

  if (!isIdle(tap) && isIdle(hold) && rest.every(isIdle)) {
    if (target.kind !== "rule" || isAllowedOutput(tap)) {
      return { table: state.table, code: tap };
    }
  }

  if (target.kind === "cell" && !isIdle(tap) && !isIdle(hold) && rest.every(isIdle)) {
    const dualUse = dualUseCodeFor(tap, hold);

    if (dualUse !== null) {
      return { table: state.table, code: dualUse };
    }
  }

  if (editable !== null) {
    return { table: withRow(state.table, editable, normalized), code: state.currentCode };
  }

  const own = state.ownBaselineSlot;
  let slot: number | null;

  if (own !== undefined && own >= 0 && own < MAX_ACTIVE_SUPERKEYS && !hasOtherRef(state.refs, own, target)) {
    slot = own;
  } else {
    slot = freeSlot(new Set([...refSlots(state.refs), ...state.protectedSlots, ...(state.heldSlots ?? [])]));
  }

  if (slot === null) {
    return { error: "capacity" };
  }

  return { table: withRow(state.table, slot, normalized), code: SUPERKEY_FIRST + slot };
};

const ONESHOT_FIRST = 49153;
const ONESHOT_LAST = 49168;
const LAYER_SHIFT_FIRST = 17450;
const LAYER_SHIFT_LAST = 17459;

/** The Tap a key's own code starts its Multi-action with. 1 when there is nothing to keep, null when the code can't be a Superkey Tap. */
export const superkeyTapSeed = (code: number): number | null => {
  if (code === 0 || code === 65535) {
    return 1;
  }

  /* A Superkey sends the plain shortcut, and the firmware ignores an Autoshift key that a Superkey sends */
  if (isHoldCode(code)) {
    return holdShortcut(code);
  }

  if (isAutoshift(code)) {
    return autoshiftBaseCode(code);
  }

  /* Leave out what the Superkey Tap picker does not offer */
  const notOffered =
    (code >= DU_FIRST && code <= DU_LAST) ||
    isSuperkeyCode(code) ||
    isSwapHandsCode(code) ||
    (code >= ONESHOT_FIRST && code <= ONESHOT_LAST) ||
    (code >= LAYER_SHIFT_FIRST && code <= LAYER_SHIFT_LAST) ||
    code === OverlayCodes.OVERLAY_KEY ||
    code === OverlayCodes.OVERLAY_HOLD;

  return notOffered ? null : code;
};

/** The slots with a definition in a table. */
export const definedSlots = (table: ReadonlyArray<ReadonlyArray<number>>): number[] =>
  table.reduce<number[]>((slots, actions, slot) => (isIdleSuperkey(actions) ? slots : [...slots, slot]), []);

/** The code a keyboard without Superkeys stores for these actions, which is nothing, a plain tap or a dual-function key. Null when none fits. */
export const dualUseOnlyCode = (actions: ReadonlyArray<number | undefined | null>): number | null => {
  const [tap, hold, ...rest] = normalizeActions(actions);

  if (rest.some(action => action !== 1)) {
    return null;
  }

  if (hold === 1) {
    return tap === 1 ? 0 : tap;
  }

  return tap === 1 ? null : dualUseCodeFor(tap, hold);
};

/* ------------------------------------------------------------------------ */
/* Garbage collection                                                       */
/* ------------------------------------------------------------------------ */

export type CollectMode = "drop" | "idleOnly";

export const collectModeFor = (format: SuperkeyWriteFormat): CollectMode => (format === "padded" ? "drop" : "idleOnly");

const sameTable = (a: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<ReadonlyArray<number>>) =>
  a.length === b.length && a.every((row, i) => actionsKey(row) === actionsKey(b[i]));

/** Idle every slot outside `keep`. In drop mode also drop the trailing idle rows outside `keep`. */
export const collectSuperkeys = (table: number[][], keep: Set<number>, mode: CollectMode): number[][] => {
  const next = table.map((row, slot) => (keep.has(slot) ? [...row] : [...IDLE_ACTIONS]));

  if (mode === "drop") {
    while (next.length > 0 && !keep.has(next.length - 1) && isIdleSuperkey(next[next.length - 1])) {
      next.pop();
    }
  }

  return sameTable(next, table) ? table : next;
};

/** The table the last GC step writes: every slot the draft references, and nothing it does not. */
export const finalGcTable = (table: number[][], draft: LayoutRefs, format: SuperkeyWriteFormat): number[][] =>
  collectSuperkeys(table, new Set(refSlots(superkeyRefs(draft))), collectModeFor(format));

/** The slots the keyboard holds that the final table idles or drops, with what they held. */
export const gcRemovals = ({
  persistedTable,
  finalTable,
}: {
  persistedTable: number[][];
  finalTable: number[][];
}): { slot: number; actions: number[] }[] =>
  persistedTable.reduce<{ slot: number; actions: number[] }[]>((removed, actions, slot) => {
    if (!isIdleSuperkey(actions) && (slot >= finalTable.length || isIdleSuperkey(finalTable[slot]))) {
      removed.push({ slot, actions: normalizeActions(actions) });
    }

    return removed;
  }, []);

/** True when a removed slot and definition is not in a recovery backup yet. `covered` maps a slot to its `actionsKey`. */
export const recoveryNeeded = (removals: { slot: number; actions: number[] }[], covered: Map<number, string>): boolean =>
  removals.some(({ slot, actions }) => covered.get(slot) !== actionsKey(actions));

/* ------------------------------------------------------------------------ */
/* Qukey collisions                                                         */
/* ------------------------------------------------------------------------ */

export type Definition = [tap: number, hold: number];

export interface ConflictMember {
  /** The Superkey slot, or undefined for native dual-use cells */
  slot?: number;
  refs: SkRef[];
  /** A slot that only keyboard state references */
  protectedOnly: boolean;
  definition: Definition;
}

export interface Conflict {
  code: number;
  members: ConflictMember[];
  /** What every member plays: the lowest slot's definition, the firmware's first match */
  winner: Definition;
  /** The code, each referencing position with the definition it asks for, and the winner */
  signature: string;
}

export interface Collisions {
  /** Identical keymap Superkeys, from slot to the lowest slot of the group, the one the keyboard reads cells back as */
  merges: Map<number, number>;
  conflicts: Conflict[];
}

const definitionKey = ([tap, hold]: Definition) => `${tap}/${hold}`;

/* An identity that survives inserts and deletes elsewhere in the rules and combos */
const refKey = (ref: SkRef, input: LayoutRefs) => {
  if (ref.kind === "cell") {
    return `c${ref.layer}:${ref.position}`;
  }

  if (ref.kind === "rule") {
    const rule = input.rules[ref.index];
    return `r${rule.layer}:${rule.position}:${basePrevious(rule.previous)}`;
  }

  const combo = input.combos[ref.index];
  const members = combo.positions
    .filter(position => position !== COMBO_POSITION_UNUSED)
    .sort((a, b) => a - b)
    .join(".");
  return `k${combo.layer}:${members}`;
};

/** Superkeys and native dual-use cells that the firmware would store under the same qukey code. Only groups with a keymap cell count. */
export const qukeyCollisions = (
  table: number[][],
  input: LayoutRefs,
  protectedSet: Set<number> = new Set(),
): Collisions => {
  const refs = superkeyRefs(input);
  const groups = new Map<number, { slots: number[]; duCells: SkRef[]; duDefinition?: Definition }>();
  const groupOf = (code: number) => {
    const group = groups.get(code) ?? { slots: [], duCells: [] };
    groups.set(code, group);
    return group;
  };

  table.forEach((actions, slot) => {
    /* Group every slot the firmware registers, since the first one with a code is what a cell with that code plays */
    if (isRegisteredQukeySuperkey({ actions, name: "", id: slot })) {
      groupOf(superkeyQukeyCode(actions[0], actions[1])).slots.push(slot);
    }
  });

  forEachCell(input, (code, ref) => {
    const decoded = code >= DU_FIRST && code <= DU_LAST ? decodeDualUse(code) : null;

    if (decoded !== null) {
      const group = groupOf(code);
      group.duCells.push(ref);
      group.duDefinition = [decoded.tap, decoded.hold];
    }
  });

  const merges = new Map<number, number>();
  const conflicts: Conflict[] = [];

  [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([code, group]) => {
      /* Only cells of slots the firmware converts become qukey codes. Cells of a modifier-tap slot keep the Superkey */
      const cellSlots = group.slots.filter(
        slot =>
          isDualFunctionSuperkey({ actions: table[slot], name: "", id: slot }) && (refs.get(slot) ?? []).some(ref => ref.kind === "cell"),
      );

      if (cellSlots.length === 0 && group.duCells.length === 0) {
        return;
      }

      const members: ConflictMember[] = group.slots.map(slot => {
        const slotRefs = refs.get(slot) ?? [];
        return {
          slot,
          refs: slotRefs,
          protectedOnly: slotRefs.length === 0 && protectedSet.has(slot),
          definition: [table[slot][0], table[slot][1]],
        };
      });

      if (group.duCells.length > 0 && group.duDefinition) {
        members.push({ refs: group.duCells, protectedOnly: false, definition: group.duDefinition });
      }

      const distinct = new Set(members.map(member => definitionKey(member.definition)));

      if (distinct.size === 1) {
        /* Merge into the lowest slot of any kind, the one the keyboard reads converted cells back as */
        const lowest = group.slots[0];
        const converted = lowest !== undefined && isDualFunctionSuperkey({ actions: table[lowest], name: "", id: lowest });

        if (converted) {
          cellSlots
            .filter(slot => slot !== lowest)
            .forEach(slot => {
              merges.set(slot, lowest);
            });
        }

        return;
      }

      /* Slots come first in table order, so the first member is the lowest slot */
      const winner = members[0].definition;
      const positions = members
        .flatMap(member => member.refs.map(ref => `${refKey(ref, input)}=${definitionKey(member.definition)}`))
        .sort();
      const signature = `${code}|${positions.join(",")}|${definitionKey(winner)}`;

      conflicts.push({ code, members, winner, signature });
    });

  return { merges, conflicts };
};

/* The custom layers with merged-away slots replaced by their target */
const applyMerges = (layers: number[][], merges: Map<number, number>): number[][] =>
  layers.map(codes =>
    codes.map(code => {
      const slot = superkeySlot(code);
      const to = slot === null ? undefined : merges.get(slot);
      return to === undefined ? code : SUPERKEY_FIRST + to;
    }),
  );

export interface PreparedSuperkeyWrite {
  table: number[][];
  /** The custom layers after the merges */
  layers: number[][];
  merges: Map<number, number>;
  /** Conflicts that block the save */
  conflicts: Conflict[];
  /** Conflicts that were already on the keyboard, unchanged */
  warnings: Conflict[];
}

/** The Superkey table and custom layers to write, with the collisions on exactly that table. */
export const prepareSuperkeyWrite = ({
  draft,
  saved,
  baseline,
  collect,
  format,
}: {
  draft: SuperkeyDraft;
  saved: SuperkeyProtection;
  baseline: SuperkeyDraft | null;
  collect: boolean;
  format: SuperkeyWriteFormat;
}): PreparedSuperkeyWrite => {
  const protectedSet = protectedSlots(saved);
  const mode = collectModeFor(format);
  const keepFor = (input: LayoutRefs) => new Set([...refSlots(superkeyRefs(input)), ...protectedSet]);
  const collected = collect ? collectSuperkeys(draft.table, keepFor(draft), mode) : draft.table;
  const { merges, conflicts: found } = qukeyCollisions(collected, draft, protectedSet);
  const layers = merges.size > 0 ? applyMerges(draft.customLayers, merges) : draft.customLayers;
  const merged = { ...draft, customLayers: layers };
  const table = collect && merges.size > 0 ? collectSuperkeys(collected, keepFor(merged), mode) : collected;
  const known = new Set(baseline ? qukeyCollisions(baseline.table, baseline).conflicts.map(conflict => conflict.signature) : []);
  const conflicts: Conflict[] = [];
  const warnings: Conflict[] = [];

  found.forEach(conflict => {
    const protectedOnly = conflict.members.some(member => member.protectedOnly);

    if (!protectedOnly && known.has(conflict.signature)) {
      warnings.push(conflict);
    } else {
      conflicts.push(conflict);
    }
  });

  return { table, layers, merges, conflicts, warnings };
};

export const defaultCellName = (layer: number, position: number) => `Layer ${layer + 1} key ${position}`;

/** A reference by name, such as "Layer 2 key 14", "Combo 4" or "Previous-key tab on Layer 1 key 20". */
export const refName = (ref: SkRef, rules: AltRepeatRule[], cellName: (layer: number, position: number) => string): string => {
  if (ref.kind === "cell") {
    return cellName(ref.layer, ref.position);
  }

  if (ref.kind === "combo") {
    return `Combo ${ref.index + 1}`;
  }

  const rule = rules[ref.index];
  return rule ? `Previous-key tab on ${cellName(rule.layer, rule.position)}` : `Previous-key rule ${ref.index + 1}`;
};

const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** A message that names every member of a conflict. */
export const conflictMessage = (
  conflict: Conflict,
  rules: AltRepeatRule[] = [],
  cellName: (layer: number, position: number) => string = defaultCellName,
): string => {
  const keymapNames = conflict.members.flatMap(member =>
    member.refs.filter(ref => ref.kind === "cell").map(ref => refName(ref, rules, cellName)),
  );
  const held = conflict.members.find(member => member.protectedOnly && member.slot !== undefined);

  if (held && held.slot !== undefined) {
    return (
      `Superkey ${held.slot + 1} is still saved on the keyboard and would be played for ${joinNames(keymapNames)}. ` +
      "Save the other change first, then set this key again."
    );
  }

  const names = conflict.members.flatMap(member => {
    if (member.refs.length === 0 && member.slot !== undefined) {
      return [`unused Superkey ${member.slot + 1}`];
    }

    return member.refs.map(ref => refName(ref, rules, cellName));
  });

  return `${joinNames(names)} share one dual-function code on the keyboard, so they would all play the same tap and hold. Change one of them.`;
};

/* ------------------------------------------------------------------------ */
/* Copies                                                                   */
/* ------------------------------------------------------------------------ */

export type SuperkeySource = ReadonlyArray<ReadonlyArray<number> | undefined>;

const sourceActions = (source: SuperkeySource, slot: number): number[] | undefined => {
  const actions = slot < MAX_ACTIVE_SUPERKEYS ? source[slot] : undefined;
  return actions === undefined || isIdleSuperkey(actions) ? undefined : normalizeActions(actions);
};

/** Give every Superkey occurrence in `codes` its own new slot, or change nothing on capacity. Idle or undefined sources become 0. */
export const cloneSuperkeyRefs = (
  codes: number[],
  sourceTable: SuperkeySource,
  table: number[][],
  used: Set<number>,
): { codes: number[]; table: number[][]; missing: number[] } | { error: "capacity" } => {
  const taken = new Set(used);
  const missing: number[] = [];
  let next = table;
  const cloned: number[] = [];

  for (let i = 0; i < codes.length; i += 1) {
    const slot = superkeySlot(codes[i]);

    if (slot === null) {
      cloned.push(codes[i]);
    } else {
      const actions = sourceActions(sourceTable, slot);

      if (actions === undefined) {
        missing.push(i);
        cloned.push(0);
      } else {
        const free = freeSlot(taken);

        if (free === null) {
          return { error: "capacity" };
        }

        taken.add(free);
        next = withRow(next, free, actions);
        cloned.push(SUPERKEY_FIRST + free);
      }
    }
  }

  return { codes: cloned, table: next, missing };
};

/** Give every file slot that `lists` reference one new slot, so a full-layout import keeps the file's sharing. */
export const remapFileSuperkeys = (
  lists: number[][],
  fileTable: SuperkeySource,
  table: number[][],
  used: Set<number>,
): { lists: number[][]; table: number[][]; missing: { list: number; index: number }[] } | { error: "capacity" } => {
  const taken = new Set(used);
  const mapping = new Map<number, number | null>();
  const missing: { list: number; index: number }[] = [];
  let next = table;
  const remapped: number[][] = [];

  for (let l = 0; l < lists.length; l += 1) {
    const out: number[] = [];

    for (let i = 0; i < lists[l].length; i += 1) {
      const code = lists[l][i];
      const slot = superkeySlot(code);

      if (slot === null) {
        out.push(code);
      } else {
        if (!mapping.has(slot)) {
          const actions = sourceActions(fileTable, slot);

          if (actions === undefined) {
            mapping.set(slot, null);
          } else {
            const free = freeSlot(taken);

            if (free === null) {
              return { error: "capacity" };
            }

            taken.add(free);
            next = withRow(next, free, actions);
            mapping.set(slot, free);
          }
        }

        const to = mapping.get(slot);

        if (to === null || to === undefined) {
          missing.push({ list: l, index: i });
          out.push(0);
        } else {
          out.push(SUPERKEY_FIRST + to);
        }
      }
    }

    remapped.push(out);
  }

  return { lists: remapped, table: next, missing };
};

/* ------------------------------------------------------------------------ */
/* Break checks and reconcile                                               */
/* ------------------------------------------------------------------------ */

export interface BreakState {
  customLayers: number[][];
  table: number[][];
  /** The firmware layer of custom layer 0 */
  layerOffset: number;
}

export interface MultiActionBreaks {
  comboIndexes: number[];
  comboReason: ComboBreakReason | null;
  ruleCount: number;
  ruleReason: AltRepeatBlock | null;
}

/** The combos and previous-key rules that an edit breaks, over every cell whose code or Superkey definition changed. */
export const multiActionBreaks = (before: BreakState, after: BreakState, combos: ComboType[], rules: AltRepeatRule[]): MultiActionBreaks => {
  const superkeysBefore = asSuperkeys(before.table);
  const superkeysAfter = asSuperkeys(after.table);
  const comboIndexes = new Set<number>();
  let comboReason: ComboBreakReason | null = null;
  let ruleCount = 0;
  let ruleReason: AltRepeatBlock | null = null;

  after.customLayers.forEach((codes, index) => {
    const layer = index + after.layerOffset;

    codes.forEach((code, position) => {
      const previous = before.customLayers[index]?.[position];
      const slot = superkeySlot(code);
      const definitionChanged = slot !== null && actionsKey(before.table[slot]) !== actionsKey(after.table[slot]);

      if (previous === undefined || (previous === code && !definitionChanged)) {
        return;
      }

      const comboAfter = comboBreakReason(code, superkeysAfter);

      if (comboAfter !== null && comboBreakReason(previous, superkeysBefore) === null) {
        const found = combosAtPosition(combos, position, layer);
        found.forEach(i => comboIndexes.add(i));

        if (found.length > 0 && comboReason === null) {
          comboReason = comboAfter;
        }
      }

      const blockAfter = altRepeatDefaultBlock(code, superkeysAfter);

      if (blockAfter !== null && altRepeatDefaultBlock(previous, superkeysBefore) === null) {
        const count = rulesAt(rules, layer, position).length;
        ruleCount += count;

        if (count > 0 && ruleReason === null) {
          ruleReason = blockAfter;
        }
      }
    });
  });

  return { comboIndexes: [...comboIndexes].sort((a, b) => a - b), comboReason, ruleCount, ruleReason };
};

/** The cells whose saved code differs from the React draft, by custom layer index. */
export const reconcileDraft = (draftLayers: number[][], savedLayers: number[][]): { layer: number; position: number; code: number }[] =>
  savedLayers.flatMap((codes, layer) =>
    codes.reduce<{ layer: number; position: number; code: number }[]>((changed, code, position) => {
      if (draftLayers[layer]?.[position] !== code) {
        changed.push({ layer, position, code });
      }

      return changed;
    }, []),
  );
