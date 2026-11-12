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

import { AltRepeatRule, AltRepeatState } from "@Renderer/types/altRepeat";
import { ComboType } from "@Renderer/types/combos";
import { HoldModsState } from "@Renderer/types/holdMods";
import {
  Conflict,
  MultiActionBreaks,
  SuperkeyDraft,
  SuperkeyProtection,
  multiActionBreaks,
  prepareSuperkeyWrite,
} from "../../../api/parsers/multiAction";
import { SuperkeyWriteFormat, UniqueSuperkeysMode } from "../../../api/parsers/superkeys";

/** One key of the keymap. The layer is the firmware layer, or the array index where a helper says so. */
export interface SwapCell {
  layer: number;
  position: number;
}

const NO_KEY = 0;
const TRANSPARENT = 65535;

const sameCell = (a: SwapCell, b: SwapCell) => a.layer === b.layer && a.position === b.position;

/** The layers with the two cells exchanged, by array index. Only the two affected layers are copied. Never mutates the input. */
export const swapCells = <T>(layers: T[][], a: SwapCell, b: SwapCell): T[][] => {
  const layerA = layers[a.layer];
  const layerB = layers[b.layer];
  const inRange = (layer: T[] | undefined, position: number) => layer !== undefined && position >= 0 && position < layer.length;

  if (sameCell(a, b) || !inRange(layerA, a.position) || !inRange(layerB, b.position)) {
    return layers;
  }

  const next = layers.slice();
  const valueA = layerA[a.position];
  const valueB = layerB[b.position];
  next[a.layer] = layerA.slice();
  next[b.layer] = a.layer === b.layer ? next[a.layer] : layerB.slice();
  next[a.layer][a.position] = valueB;
  next[b.layer][b.position] = valueA;
  return next;
};

/** The rules with the previous-key tabs of the two cells exchanged, in firmware layers. Keeps order, count and untouched rules. */
export const swapRules = (rules: AltRepeatRule[], a: SwapCell, b: SwapCell): AltRepeatRule[] => {
  if (sameCell(a, b) || !rules.some(rule => sameCell(rule, a) || sameCell(rule, b))) {
    return rules;
  }

  return rules.map(rule => {
    if (sameCell(rule, a)) {
      return { ...rule, layer: b.layer, position: b.position };
    }

    if (sameCell(rule, b)) {
      return { ...rule, layer: a.layer, position: a.position };
    }

    return rule;
  });
};

/** The firmware layers with a key other than NoKey or Transparent, plus the source layer, ascending. */
export const nonEmptyLayers = (customCodes: number[][], layerOffset: number, sourceLayer: number): number[] => {
  const layers = new Set<number>([sourceLayer]);

  customCodes.forEach((codes, index) => {
    if (codes.some(code => code !== NO_KEY && code !== TRANSPARENT)) {
      layers.add(index + layerOffset);
    }
  });

  return [...layers].sort((a, b) => a - b);
};

/** True while the Sonsei may still discover previous-key tabs, after its `help` read failed. */
export const rulesSupportUnknown = (altRepeatState: AltRepeatState, holdModsState: HoldModsState, isSonsei: boolean): boolean =>
  isSonsei && altRepeatState === "unsupported" && holdModsState === "loading";

export interface KeyRect {
  top: number;
  right: number;
  width: number;
  height: number;
}

/** The top and right edge of the drawn keys, or null when none is drawn. */
export const keyRectsUnion = (rects: KeyRect[]): { top: number; right: number } | null => {
  const drawn = rects.filter(rect => rect.width > 0 && rect.height > 0);

  if (drawn.length === 0) {
    return null;
  }

  return {
    top: Math.min(...drawn.map(rect => rect.top)),
    right: Math.max(...drawn.map(rect => rect.right)),
  };
};

export const SWAP_LIST_MAX = 240;
export const SWAP_LIST_MIN = 160;
export const SWAP_LIST_COMPACT = 56;

export interface SwapListAnchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  /* Rows show only the layer number */
  compact: boolean;
}

/** Place the layer list right of the keys. Go compact when a full list does not fit, and overlap the rightmost keys only when even that fails. */
export const swapListAnchor = (
  keys: { top: number; right: number },
  viewport: { width: number; height: number },
  gap = 12,
): SwapListAnchor => {
  const available = viewport.width - keys.right - 2 * gap;
  const top = Math.max(gap, Math.min(keys.top, viewport.height - 160));
  const maxHeight = viewport.height - top - gap;

  if (available >= SWAP_LIST_MIN) {
    return { top, left: keys.right + gap, width: Math.min(SWAP_LIST_MAX, available), maxHeight, compact: false };
  }

  if (available >= SWAP_LIST_COMPACT) {
    return { top, left: keys.right + gap, width: available, maxHeight, compact: true };
  }

  const width = SWAP_LIST_COMPACT;
  return { top, left: Math.max(gap, viewport.width - width - gap), width, maxHeight, compact: true };
};

export const KEY_SWAP_ROOT_CLASS = "keySwapDragging";

/* Tailwind purple-200 */
const HOVER_COLOR = "rgb(120, 121, 241)";

/** Dim the dragged key, outline the key under the pointer and show the grabbing cursor everywhere while a drag runs. */
export const keySwapStyles = (
  source: SwapCell | null,
  displayedLayer: number,
  hover: SwapCell | null,
  scope = ".layoutEditor",
): string => {
  if (source === null) {
    return "";
  }

  const key = (cell: SwapCell) => `${scope} .keyItem[data-layer="${cell.layer}"][data-key-index="${cell.position}"]`;
  const rules = [`html.${KEY_SWAP_ROOT_CLASS}, html.${KEY_SWAP_ROOT_CLASS} * { cursor: grabbing !important; }`];

  if (displayedLayer === source.layer) {
    rules.push(`${key(source)} { opacity: 0.45; }`);
  }

  if (hover !== null && !sameCell(hover, source)) {
    rules.push(`${key(hover)} { filter: drop-shadow(0 0 6px ${HOVER_COLOR}); }`);
  }

  return rules.join("\n");
};

export type SwapPlan =
  | { kind: "noop" }
  | { kind: "refused"; reason: "missing" | "modeUnknown" | "conflict"; conflicts: Conflict[] }
  | { kind: "swap"; after: number[][]; movedRules: AltRepeatRule[]; breaks: MultiActionBreaks; a: SwapCell; b: SwapCell };

export interface SwapSuperkeyInput {
  refs: { defaultLayers: number[][]; combos: ComboType[] };
  saved: SuperkeyProtection;
  baseline: SuperkeyDraft | null;
  collect: boolean;
  format: SuperkeyWriteFormat;
  mode: UniqueSuperkeysMode;
}

export interface SwapInput {
  /* Codes of the custom layers, by array index */
  custom: number[][];
  rules: AltRepeatRule[];
  /* Firmware layers */
  from: SwapCell;
  to: SwapCell;
  layerOffset: number;
  combos: ComboType[];
  table: number[][];
  unique: boolean;
  repeatKeyRules: boolean;
  repeatTapRules: boolean;
  /* Only when the Superkeys are read, to refuse what Save would refuse */
  superkeys?: SwapSuperkeyInput;
}

/** What a drop from `from` on `to` does: nothing, a refusal Save would also give, or the swapped draft with the combos it breaks. */
export const planSwap = (input: SwapInput): SwapPlan => {
  const { custom, rules, from, to, layerOffset, combos, table, unique, repeatKeyRules, repeatTapRules, superkeys } = input;
  const a = { layer: from.layer - layerOffset, position: from.position };
  const b = { layer: to.layer - layerOffset, position: to.position };
  const codeA = custom[a.layer]?.[a.position];
  const codeB = custom[b.layer]?.[b.position];

  if (codeA === undefined || codeB === undefined) {
    return { kind: "refused", reason: "missing", conflicts: [] };
  }

  if (sameCell(from, to)) {
    return { kind: "noop" };
  }

  const after = swapCells(custom, a, b);
  const movedRules = swapRules(rules, from, to);

  if (codeA === codeB && movedRules === rules) {
    return { kind: "noop" };
  }

  if (superkeys) {
    const prepare = (customLayers: number[][], draftRules: AltRepeatRule[]) =>
      prepareSuperkeyWrite({
        draft: { customLayers, ...superkeys.refs, layerOffset, rules: draftRules, table },
        saved: superkeys.saved,
        baseline: superkeys.baseline,
        collect: superkeys.collect,
        format: superkeys.format,
        mode: superkeys.mode,
      });
    const before = prepare(custom, rules);
    const swapped = prepare(after, movedRules);

    if (swapped.modeUnknown && !before.modeUnknown) {
      return { kind: "refused", reason: "modeUnknown", conflicts: [] };
    }

    const known = new Set(before.conflicts.map(conflict => conflict.code));
    const added = swapped.conflicts.filter(conflict => !known.has(conflict.code));

    if (added.length > 0) {
      return { kind: "refused", reason: "conflict", conflicts: added };
    }
  }

  /* Pass no rules, since the tabs move with their key */
  const breaks = multiActionBreaks(
    { customLayers: custom, table, layerOffset },
    { customLayers: after, table, layerOffset },
    combos,
    [],
    unique,
    repeatKeyRules,
    repeatTapRules,
  );

  return { kind: "swap", after, movedRules, breaks, a, b };
};
