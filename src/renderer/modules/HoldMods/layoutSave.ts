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
import { HoldModsEntry } from "@Renderer/types/holdMods";
import { serializeAltRepeat } from "../../../api/parsers/altRepeat";
import {
  HoldRefSkip,
  canonicalHoldSave,
  gcHoldMods,
  holdCodeRefs,
  plainHoldOutputs,
  plainPartialHoldLayers,
  serializeHoldMods,
} from "../../../api/parsers/holdMods";
import { isPartialHold } from "../../../hw/layerhold";

/* The Layout editor's save of the keymap, the previous-key rules and the held modifiers table.
 *
 * The table goes first, so every partial code the keymap and rules send has its entry. Entries no key uses go last, after the keymap and
 * the rules are stored. The saved state tracks what the keyboard may hold after each step, so a failed save never lets a later edit change
 * the meaning of a code the keyboard may still use.
 */

/** "settled": the table and rules are loaded. "unsupported": the firmware lacks the table. "pending": the table is not loaded yet. */
export type LayoutSaveMode = "settled" | "unsupported" | "pending";

export type LayoutSaveStep = "table" | "keymap" | "rules" | "gc";

/** What the keyboard holds as far as the editor knows. A null baseline forces the next save to write. */
export interface HoldSavedState {
  /* The serialized table */
  holdMods: string | null;
  /* The keymap as keymapSaveKey gives it */
  keymap: string | null;
  /* The keymap codes and rules last known on the keyboard */
  keymapCodes: number[];
  ruleRefs: AltRepeatRule[];
  /* Partial codes of a keymap or rules write that failed, which the keyboard may hold */
  uncertainKeymap: number[];
  uncertainRules: number[];
}

export const EMPTY_HOLD_SAVED: HoldSavedState = {
  holdMods: null,
  keymap: null,
  keymapCodes: [],
  ruleRefs: [],
  uncertainKeymap: [],
  uncertainRules: [],
};

export interface HoldBaseline {
  keymap: string;
  keymapCodes: number[];
  ruleRefs: AltRepeatRule[];
}

/** Compare keymaps with their onlyCustom flag, which the same step writes. */
export const keymapSaveKey = (codes: number[], onlyCustom: boolean): string => `${codes.join(" ")}|${onlyCustom ? "1" : "0"}`;

/** The saved state after reading the table, keymap and rules from the keyboard uncached. Nothing is uncertain any more. */
export const withHoldBaseline = (table: HoldModsEntry[], baseline: HoldBaseline): HoldSavedState => ({
  holdMods: serializeHoldMods(table),
  keymap: baseline.keymap,
  keymapCodes: baseline.keymapCodes,
  ruleRefs: baseline.ruleRefs,
  uncertainKeymap: [],
  uncertainRules: [],
});

/** The partial codes the keyboard may hold, whose meaning an edit must not change. */
export const protectedHoldCodes = (saved: HoldSavedState): Set<number> => {
  const codes = holdCodeRefs([saved.keymapCodes], saved.ruleRefs);
  saved.uncertainKeymap.forEach(code => codes.add(code));
  saved.uncertainRules.forEach(code => codes.add(code));
  return codes;
};

/** The codes an allocation must keep: the draft's, without `skip`, and the protected ones. */
export const usedHoldCodes = (
  layers: number[][],
  rules: AltRepeatRule[],
  saved: HoldSavedState,
  skip?: HoldRefSkip,
): Set<number> => {
  const codes = holdCodeRefs(layers, rules, skip);
  protectedHoldCodes(saved).forEach(code => codes.add(code));
  return codes;
};

const addPartials = (into: number[], codes: number[]): number[] =>
  Array.from(new Set(into.concat(codes.filter(isPartialHold)))).sort((a, b) => a - b);

export interface LayoutSaveIO {
  /* Each throws when the keyboard did not store the data */
  writeHoldMods: (list: HoldModsEntry[]) => Promise<void>;
  writeKeymap: (serialized: string, onlyCustom: boolean) => Promise<void>;
  writeRules: (rules: AltRepeatRule[]) => Promise<void>;
}

export interface LayoutSaveInput {
  mode: LayoutSaveMode;
  /* The custom layers as key codes */
  layers: number[][];
  rules: AltRepeatRule[];
  rulesReady: boolean;
  onlyCustom: boolean;
  table: HoldModsEntry[];
  saved: HoldSavedState;
  /* The serialized rules on the keyboard, null when unknown */
  savedRules: string | null;
}

export interface LayoutSaveOutcome {
  /* The steps that wrote, in order */
  done: LayoutSaveStep[];
  failed?: LayoutSaveStep;
  error?: unknown;
  /* The draft as saved, returned unchanged when nothing changed */
  layers: number[][];
  rules: AltRepeatRule[];
  table: HoldModsEntry[];
  saved: HoldSavedState;
  savedRules: string | null;
}

const canonicalDraft = (input: LayoutSaveInput): { layers: number[][]; rules: AltRepeatRule[] } => {
  if (input.mode === "settled") {
    return canonicalHoldSave(input.layers, input.rules, input.table);
  }

  /* Firmware without the table would play partial codes as plain shortcuts anyway, but history and CapsWord skip them */
  if (input.mode === "unsupported") {
    return { layers: plainPartialHoldLayers(input.layers), rules: plainHoldOutputs(input.rules) };
  }

  return { layers: input.layers, rules: input.rules };
};

/** Write what changed in the order table, keymap, rules, unused entries. Stop at the first failed step and report the progress. */
export const runLayoutSave = async (io: LayoutSaveIO, input: LayoutSaveInput): Promise<LayoutSaveOutcome> => {
  const { layers, rules } = canonicalDraft(input);
  const codes = layers.flat();
  const keymap = keymapSaveKey(codes, input.onlyCustom);
  const serializedRules = serializeAltRepeat(rules);
  const settled = input.mode === "settled";
  const done: LayoutSaveStep[] = [];
  let { saved, savedRules, table } = input;

  const outcome = (failed?: LayoutSaveStep, error?: unknown): LayoutSaveOutcome => ({
    done,
    failed,
    error,
    layers,
    rules,
    table,
    saved,
    savedRules,
  });

  /* The table never drops an entry a protected code uses, so the keyboard's keys keep their meaning */
  if (settled && serializeHoldMods(table) !== saved.holdMods) {
    try {
      await io.writeHoldMods(table);
    } catch (error) {
      saved = { ...saved, holdMods: null };
      return outcome("table", error);
    }

    saved = { ...saved, holdMods: serializeHoldMods(table) };
    done.push("table");
  }

  if (keymap !== saved.keymap) {
    try {
      await io.writeKeymap(codes.join(" "), input.onlyCustom);
    } catch (error) {
      saved = { ...saved, keymap: null, uncertainKeymap: addPartials(saved.uncertainKeymap, codes) };
      return outcome("keymap", error);
    }

    saved = { ...saved, keymap, keymapCodes: codes, uncertainKeymap: [] };
    done.push("keymap");
  }

  if (input.rulesReady && serializedRules !== savedRules) {
    try {
      await io.writeRules(rules);
    } catch (error) {
      /* The write may have landed before its read-back failed */
      savedRules = null;
      saved = {
        ...saved,
        uncertainRules: addPartials(
          saved.uncertainRules,
          rules.map(rule => rule.output),
        ),
      };
      return outcome("rules", error);
    }

    savedRules = serializedRules;
    saved = { ...saved, ruleRefs: rules, uncertainRules: [] };
    done.push("rules");
  }

  if (settled) {
    const keep = usedHoldCodes(layers, rules, saved);
    const collected = gcHoldMods(table, keep);

    if (collected !== table) {
      try {
        await io.writeHoldMods(collected);
      } catch (error) {
        saved = { ...saved, holdMods: null };
        return outcome("gc", error);
      }

      table = collected;
      saved = { ...saved, holdMods: serializeHoldMods(collected) };
      done.push("gc");
    }
  }

  return outcome();
};
