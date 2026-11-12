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
import { PerKeyOverride, serializePerKeyOverrides } from "../../../api/parsers/dualFunction";
import {
  HoldRefSkip,
  canonicalHoldSave,
  gcHoldMods,
  holdCodeRefs,
  plainHoldOutputs,
  plainPartialHoldLayers,
  serializeHoldMods,
} from "../../../api/parsers/holdMods";
import { LayoutRefs, collectModeFor, collectSuperkeys, protectedSlots, superkeyRefs } from "../../../api/parsers/multiAction";
import {
  SuperkeyWriteFormat,
  normalizeActions,
  parseSuperkeysTable,
  serializeSuperkeyTable,
} from "../../../api/parsers/superkeys";
import { isPartialHold } from "../../../hw/layerhold";
import { LedCustomSlot } from "../../../api/parsers/ledCustom";
import { LedSavedState, collectLedSlots, ledRefSlots, sortedUnion as sortedSlotUnion, writeLedTable } from "../LedCustom/ledSave";

/* The Layout editor's save of the keymap, the previous-key rules and the held modifiers table.
 *
 * The table goes first, so every partial code the keymap and rules send has its entry. Entries no key uses go last, after the keymap and
 * the rules are stored. The saved state tracks what the keyboard may hold after each step, so a failed save never lets a later edit change
 * the meaning of a code the keyboard may still use.
 *
 * With Superkeys the order is table, superkeys.map, keymap, rules, per-key options, unused table entries, unused Superkeys. The keyboard
 * converts dual-function Superkeys only when the keymap is written, so every Superkey write is followed by a keymap write.
 *
 * The custom LED effects follow the same pattern. led.custom goes right after the held modifiers table and its unused slots are freed after
 * the unused table entries.
 */

/** "settled": the table and rules are loaded. "unsupported": the firmware lacks the table. "pending": the table is not loaded yet. */
export type LayoutSaveMode = "settled" | "unsupported" | "pending";

export type LayoutSaveStep =
  | "table"
  | "ledTable"
  | "superkeys"
  | "keymap"
  | "rules"
  | "perKey"
  | "gc"
  | "ledGc"
  | "skgc"
  | "keymapAfterGc";

/** "ready": the table is loaded and parsed. "unsupported": the keyboard has no Superkeys. "failed": the table could not be read. */
export type SuperkeyMode = "ready" | "unsupported" | "failed";

/** What the keyboard holds of the Superkeys as far as the editor knows. Slots are Superkey indexes. */
export interface SuperkeySavedState {
  /* The superkeys.map data on the keyboard, null when unknown */
  table: string | null;
  /* The firmware's active row count, null when unknown */
  storedRows: number | null;
  /* A Superkey write landed, or may have, after the last keymap write */
  keymapStale: boolean;
  /* The padded clean-up write for an unknown row count ran in this editor session */
  cleanupDone: boolean;
  keymapRefs: number[];
  ruleRefs: number[];
  comboRefs: number[];
  /* Slots of a write that failed, which the keyboard may hold */
  uncertainKeymap: number[];
  uncertainRules: number[];
  uncertainCombos: number[];
}

export const EMPTY_SUPERKEY_SAVED: SuperkeySavedState = {
  table: null,
  storedRows: null,
  keymapStale: false,
  cleanupDone: false,
  keymapRefs: [],
  ruleRefs: [],
  comboRefs: [],
  uncertainKeymap: [],
  uncertainRules: [],
  uncertainCombos: [],
};

export interface SuperkeySaveInput {
  mode: SuperkeyMode;
  format: SuperkeyWriteFormat;
  /* From prepareSuperkeyWrite. In ready mode its layers are the ones saved */
  prepared: { table: number[][]; layers: number[][] };
  /* Drop the Superkeys nothing references once the keymap and rules are saved */
  collect: boolean;
  /* The references outside the custom layers and rules this save writes */
  draftRefs: Pick<LayoutRefs, "defaultLayers" | "layerOffset" | "combos">;
  saved: SuperkeySavedState;
}

export interface LedSaveInput {
  table: LedCustomSlot[];
  saved: LedSavedState;
  /* Free the slots nothing references once the keymap and rules are saved */
  collect: boolean;
  /* The references outside the custom layers and rules this save writes */
  draftRefs: { defaultLayers: number[][]; combos: ReadonlyArray<{ action: number }> };
}

export interface PerKeySaveInput {
  list: PerKeyOverride[];
  /* The serialized overrides on the keyboard, null when unknown */
  saved: string | null;
}

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
  /* Required with a ready Superkey input. Return the stored row count as writeSuperkeyTable does */
  writeSuperkeys?: (table: number[][], format: SuperkeyWriteFormat, storedRows: number | null) => Promise<number | null>;
  /* Required with a per-key input */
  writePerKey?: (list: PerKeyOverride[]) => Promise<void>;
  /* Required with a custom LED effects input */
  writeLedCustom?: (table: LedCustomSlot[]) => Promise<void>;
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
  superkeys?: SuperkeySaveInput;
  perKey?: PerKeySaveInput;
  /* Only when the table, the keymap, the rules and the combos are known */
  ledCustom?: LedSaveInput;
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
  /* Only with a Superkey input. The table the save ends with, which the keyboard holds only when nothing failed, and the saved state */
  superkeys?: { table: number[][]; saved: SuperkeySavedState };
  /* Only with a per-key input */
  perKeySaved?: string | null;
  /* Only with a custom LED effects input. The table the save ends with and the saved state, also after a failed step */
  ledCustom?: { table: LedCustomSlot[]; saved: LedSavedState };
}

const canonicalDraft = (input: LayoutSaveInput): { layers: number[][]; rules: AltRepeatRule[] } => {
  const draftLayers = input.superkeys?.mode === "ready" ? input.superkeys.prepared.layers : input.layers;

  if (input.mode === "settled") {
    return canonicalHoldSave(draftLayers, input.rules, input.table);
  }

  /* Firmware without the table would play partial codes as plain shortcuts anyway, but history and CapsWord skip them */
  if (input.mode === "unsupported") {
    return { layers: plainPartialHoldLayers(draftLayers), rules: plainHoldOutputs(input.rules) };
  }

  return { layers: draftLayers, rules: input.rules };
};

const sortedUnion = (into: number[], slots: number[]): number[] => Array.from(new Set(into.concat(slots))).sort((a, b) => a - b);

const slotsOf = (refs: Pick<LayoutRefs, "customLayers" | "defaultLayers" | "layerOffset" | "rules">): number[] =>
  [...superkeyRefs({ ...refs, combos: [] }).keys()].sort((a, b) => a - b);

const keymapSlots = (layers: number[][], draftRefs: SuperkeySaveInput["draftRefs"]): number[] =>
  slotsOf({ customLayers: layers, defaultLayers: draftRefs.defaultLayers, layerOffset: draftRefs.layerOffset, rules: [] });

const ruleSlots = (rules: AltRepeatRule[]): number[] => slotsOf({ customLayers: [], defaultLayers: [], layerOffset: 0, rules });

/* True when the saved superkeys.map data holds exactly `table` */
const holdsTable = (saved: string | null, table: number[][]): boolean => {
  const parsed = saved === null ? null : parseSuperkeysTable(saved);
  return (
    parsed !== null &&
    parsed.table.length === table.length &&
    parsed.table.every((row, i) => normalizeActions(row).join(" ") === normalizeActions(table[i]).join(" "))
  );
};

/** True when superkeys.map needs a write. A padded write also clears stale rows behind the table, once per editor session when the row
 * count is unknown. */
export const superkeyWriteNeeded = (format: SuperkeyWriteFormat, saved: SuperkeySavedState, table: number[][]): boolean => {
  if (!holdsTable(saved.table, table)) {
    return true;
  }

  if (format !== "padded") {
    return false;
  }

  return saved.storedRows === null ? !saved.cleanupDone : saved.storedRows !== table.length;
};

/** Write what changed in the order table, Superkeys, keymap, rules, per-key options, unused entries, unused Superkeys. Stop at the first
 * failed step and report the progress. */
export const runLayoutSave = async (io: LayoutSaveIO, input: LayoutSaveInput): Promise<LayoutSaveOutcome> => {
  const sk = input.superkeys;
  const skReady = sk?.mode === "ready";
  const { writeSuperkeys: sendSuperkeys, writePerKey: sendPerKey, writeLedCustom: sendLedCustom } = io;
  const led = input.ledCustom;

  if (skReady && !sendSuperkeys) {
    throw new Error("A Superkey save needs writeSuperkeys");
  }

  if (input.perKey && !sendPerKey) {
    throw new Error("A per-key save needs writePerKey");
  }

  if (led && !sendLedCustom) {
    throw new Error("A custom LED effects save needs writeLedCustom");
  }

  const { layers, rules } = canonicalDraft(input);
  const codes = layers.flat();
  const keymap = keymapSaveKey(codes, input.onlyCustom);
  const serializedRules = serializeAltRepeat(rules);
  const settled = input.mode === "settled";
  const done: LayoutSaveStep[] = [];
  let { saved, savedRules, table } = input;
  let skSaved = sk?.saved;
  let skTable = sk?.prepared.table;
  let perKeySaved = input.perKey?.saved;
  let ledSaved = led?.saved;
  let ledTable = led?.table;
  /* The LED slots the keymap this save writes holds, default layers included */
  const ledKeymapSlots = led ? ledRefSlots({ layers: [...led.draftRefs.defaultLayers, ...layers] }) : [];
  const ledRuleSlots = ledRefSlots({ layers: [], rules });

  const outcome = (failed?: LayoutSaveStep, error?: unknown): LayoutSaveOutcome => ({
    done,
    failed,
    error,
    layers,
    rules,
    table,
    saved,
    savedRules,
    ...(sk && skSaved && skTable ? { superkeys: { table: skTable, saved: skSaved } } : {}),
    ...(input.perKey ? { perKeySaved } : {}),
    ...(ledSaved && ledTable ? { ledCustom: { table: ledTable, saved: ledSaved } } : {}),
  });

  /* Write the Superkey table and mark the keymap for a rewrite. On failure the keyboard may hold any part of it */
  const writeSuperkeys = async (
    send: NonNullable<LayoutSaveIO["writeSuperkeys"]>,
    next: number[][],
    state: SuperkeySavedState,
    format: SuperkeyWriteFormat,
  ): Promise<SuperkeySavedState> => {
    try {
      const data = serializeSuperkeyTable(next, format, state.storedRows);
      const storedRows = await send(next, format, state.storedRows);
      return { ...state, table: data, storedRows, keymapStale: true, cleanupDone: true };
    } catch (error) {
      skSaved = { ...state, table: null, storedRows: null, keymapStale: true, cleanupDone: true };
      throw error;
    }
  };

  /* Write the keymap. On failure its codes and Superkeys become uncertain */
  const writeKeymap = async (): Promise<void> => {
    try {
      await io.writeKeymap(codes.join(" "), input.onlyCustom);
    } catch (error) {
      saved = { ...saved, keymap: null, uncertainKeymap: addPartials(saved.uncertainKeymap, codes) };

      if (ledSaved) {
        ledSaved = { ...ledSaved, uncertainKeymap: sortedSlotUnion(ledSaved.uncertainKeymap, ledKeymapSlots) };
      }

      if (sk && skSaved) {
        skSaved = { ...skSaved, uncertainKeymap: sortedUnion(skSaved.uncertainKeymap, keymapSlots(layers, sk.draftRefs)) };
      }

      throw error;
    }

    saved = { ...saved, keymap, keymapCodes: codes, uncertainKeymap: [] };

    if (ledSaved) {
      ledSaved = { ...ledSaved, keymapRefs: ledKeymapSlots, uncertainKeymap: [] };
    }

    if (sk && skSaved) {
      skSaved = { ...skSaved, keymapStale: false, keymapRefs: keymapSlots(layers, sk.draftRefs), uncertainKeymap: [] };
    }
  };

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

  /* The LED effects go before the keymap and rules, so every slot a key sends has its settings */
  if (sendLedCustom && ledSaved && ledTable) {
    const written = await writeLedTable(sendLedCustom, ledTable, ledSaved);
    ledSaved = written.saved;

    if (written.error !== undefined) {
      return outcome("ledTable", written.error);
    }

    if (written.wrote) {
      done.push("ledTable");
    }
  }

  /* Superkeys go before the keymap, so every Superkey a key sends is defined */
  if (skReady && sendSuperkeys && skSaved && skTable && superkeyWriteNeeded(sk.format, skSaved, skTable)) {
    try {
      skSaved = await writeSuperkeys(sendSuperkeys, skTable, skSaved, sk.format);
    } catch (error) {
      return outcome("superkeys", error);
    }

    done.push("superkeys");
  }

  if (keymap !== saved.keymap || skSaved?.keymapStale) {
    try {
      await writeKeymap();
    } catch (error) {
      return outcome("keymap", error);
    }

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

      if (skSaved) {
        skSaved = { ...skSaved, uncertainRules: sortedUnion(skSaved.uncertainRules, ruleSlots(rules)) };
      }

      if (ledSaved) {
        ledSaved = { ...ledSaved, uncertainRules: sortedSlotUnion(ledSaved.uncertainRules, ledRuleSlots) };
      }

      return outcome("rules", error);
    }

    savedRules = serializedRules;
    saved = { ...saved, ruleRefs: rules, uncertainRules: [] };

    if (skSaved) {
      skSaved = { ...skSaved, ruleRefs: ruleSlots(rules), uncertainRules: [] };
    }

    if (ledSaved) {
      ledSaved = { ...ledSaved, ruleRefs: ledRuleSlots, uncertainRules: [] };
    }

    done.push("rules");
  }

  if (input.perKey && sendPerKey) {
    const serializedPerKey = serializePerKeyOverrides(input.perKey.list);

    if (serializedPerKey !== perKeySaved) {
      try {
        await sendPerKey(input.perKey.list);
      } catch (error) {
        /* Rewrite the overrides on the next save, whatever the draft is then */
        perKeySaved = null;
        return outcome("perKey", error);
      }

      perKeySaved = serializedPerKey;
      done.push("perKey");
    }
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

  /* Keep the slots the draft references and the keyboard may still play, now that the keymap and rules are saved */
  if (led && led.collect && sendLedCustom && ledSaved && ledTable) {
    const draft = { layers: [...led.draftRefs.defaultLayers, ...layers], rules, combos: led.draftRefs.combos };
    const collected = collectLedSlots(ledTable, draft, ledSaved);

    if (collected !== ledTable) {
      const written = await writeLedTable(sendLedCustom, collected, ledSaved);
      ledSaved = written.saved;

      if (written.error !== undefined) {
        return outcome("ledGc", written.error);
      }

      ledTable = collected;

      if (written.wrote) {
        done.push("ledGc");
      }
    }
  }

  /* Keep what the draft references and what the keyboard may still hold, now that the keymap and rules are saved */
  if (skReady && sendSuperkeys && sk.collect && skSaved && skTable) {
    const keep = new Set([...superkeyRefs({ customLayers: layers, rules, ...sk.draftRefs }).keys(), ...protectedSlots(skSaved)]);
    const collected = collectSuperkeys(skTable, keep, collectModeFor(sk.format));

    if (collected !== skTable) {
      try {
        skSaved = await writeSuperkeys(sendSuperkeys, collected, skSaved, sk.format);
      } catch (error) {
        return outcome("skgc", error);
      }

      skTable = collected;
      done.push("skgc");

      try {
        await writeKeymap();
      } catch (error) {
        return outcome("keymapAfterGc", error);
      }

      done.push("keymapAfterGc");
    }
  }

  return outcome();
};
