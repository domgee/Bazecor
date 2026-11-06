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

import { SuperkeysType } from "@Renderer/types/superkeys";

import { DU_FIRST, DU_LAST, SUPERKEY_FIRST, isDualFunctionSuperkey } from "../../../api/parsers/altRepeat";
import {
  DUAL_FUNCTION_MODES,
  PerKeyOverride,
  isOverrideEmpty,
  serializePerKeyOverrides,
} from "../../../api/parsers/dualFunction";
import { SwapHandsCodes, isSwapTap } from "../../../hw/swaphands";

/* Edit the per-key dual-function overrides of the Dual-function Keys page. Every function returns a new list, sorted by position, with no
 * entry that only uses the global settings, so the list always matches what the keyboard sends back */

/** The ranges the page offers. The keyboard accepts more, so a stored value outside them widens its slider. */
export const HOLD_TIMEOUT_RANGE = { min: 50, max: 1000, step: 5, fallback: 250 };
export const QUICK_TAP_RANGE = { min: 0, max: 500, step: 5, fallback: 0 };
export const PRIOR_INTERVAL_RANGE = { min: 0, max: 254, step: 1, fallback: 75 };

export type NumericField = "holdTimeout" | "quickTapTerm" | "priorInterval";
export type TriStateField = "chordal" | "speculative" | "retro";
export type OverridePatch = Partial<Omit<PerKeyOverride, "position">>;

/** The value of a select for a mode or an on/off field. "global" stands for null. */
export type Choice = "global" | string;
export const GLOBAL_CHOICE = "global";
const ON_CHOICE = "on";
const OFF_CHOICE = "off";

const SUPERKEY_COUNT = 128;

/** A key with no override, which uses every global setting. */
export const emptyOverride = (position: number): PerKeyOverride => ({
  position,
  holdTimeout: null,
  quickTapTerm: null,
  priorInterval: null,
  mode: null,
  chordal: null,
  speculative: null,
  retro: null,
});

/** The override of `position`, or an empty one when the key has none. */
export const overrideAt = (list: PerKeyOverride[], position: number): PerKeyOverride =>
  list.find(o => o.position === position) ?? emptyOverride(position);

/** Return `list` with the override of `position` removed. */
export const clearOverride = (list: PerKeyOverride[], position: number): PerKeyOverride[] =>
  list.filter(o => o.position !== position);

/** Return `list` with `next` in place of the override at its position, or without it when `next` is empty. */
export const withOverride = (list: PerKeyOverride[], next: PerKeyOverride): PerKeyOverride[] => {
  const rest = clearOverride(list, next.position);

  if (isOverrideEmpty(next)) {
    return rest;
  }

  return rest.concat([{ ...next }]).sort((a, b) => a.position - b.position);
};

/** Return `list` with `patch` applied to the override of `position`. */
export const updateOverride = (list: PerKeyOverride[], position: number, patch: OverridePatch): PerKeyOverride[] =>
  withOverride(list, { ...overrideAt(list, position), ...patch, position });

/** Return true when both lists hold the same overrides. */
export const sameOverrides = (a: PerKeyOverride[], b: PerKeyOverride[]): boolean =>
  serializePerKeyOverrides(a) === serializePerKeyOverrides(b);

/** Return the select value for an on/off field. */
export const triStateChoice = (value: boolean | null): Choice => {
  if (value === null) {
    return GLOBAL_CHOICE;
  }

  return value ? ON_CHOICE : OFF_CHOICE;
};

/** Return the on/off field for a select value, or undefined for a value the select does not offer. */
export const triStateFromChoice = (choice: Choice): boolean | null | undefined => {
  if (choice === GLOBAL_CHOICE) {
    return null;
  }

  if (choice === ON_CHOICE || choice === OFF_CHOICE) {
    return choice === ON_CHOICE;
  }

  return undefined;
};

/** Return the select value for a mode. */
export const modeChoice = (mode: number | null): Choice => (mode === null ? GLOBAL_CHOICE : String(mode));

/** Return the mode for a select value, or undefined for a value the select does not offer. */
export const modeFromChoice = (choice: Choice): number | null | undefined => {
  if (choice === GLOBAL_CHOICE) {
    return null;
  }

  return DUAL_FUNCTION_MODES.find(mode => String(mode) === choice);
};

/** Return the value a field starts at when it stops using the global setting. Use the global value inside the page's range, else `fallback`. */
export const startValue = (global: number | null, range: { min: number; max: number; fallback: number }): number => {
  if (global === null || !Number.isInteger(global) || global < 0) {
    return range.fallback;
  }

  return Math.min(range.max, Math.max(range.min, global));
};

/** The slider bounds for `value`, widened so a stored value outside the page's range shows as it is. */
export const sliderBounds = (value: number, range: { min: number; max: number }): { min: number; max: number } => ({
  min: Math.min(range.min, value),
  max: Math.max(range.max, value),
});

export type KeyRole = "dualFunction" | "swapHands" | "other";

/** Return which overrides apply to `keyCode`. A dual-function key uses all of them, a timed swap hands key only the hold timeout. */
export const keyRole = (keyCode: number | undefined, superkeys: SuperkeysType[] = []): KeyRole => {
  if (keyCode === undefined) {
    return "other";
  }

  if (keyCode >= DU_FIRST && keyCode <= DU_LAST) {
    return "dualFunction";
  }

  if (keyCode >= SUPERKEY_FIRST && keyCode < SUPERKEY_FIRST + SUPERKEY_COUNT) {
    return isDualFunctionSuperkey(superkeys[keyCode - SUPERKEY_FIRST]) ? "dualFunction" : "other";
  }

  if (isSwapTap(keyCode) || keyCode === SwapHandsCodes.SWAP_HANDS_TAP_TOGGLE) {
    return "swapHands";
  }

  return "other";
};
