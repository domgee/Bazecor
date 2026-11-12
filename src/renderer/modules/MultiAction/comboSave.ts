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

import { ComboType } from "@Renderer/types/combos";
import {
  Conflict,
  LayoutRefs,
  SuperkeyDraft,
  collectModeFor,
  collectSuperkeys,
  prepareSuperkeyWrite,
  protectedSlots,
  reconcileDraft,
  superkeyRefs,
} from "../../../api/parsers/multiAction";
import { serializeCombos } from "../../../api/parsers/combos";
import { parseKeymapRaw } from "../../../api/parsers/keymap";
import { SuperkeyWriteFormat, UniqueSuperkeysMode, serializeSuperkeyTable } from "../../../api/parsers/superkeys";
import { SuperkeySavedState, superkeyWriteNeeded } from "../HoldMods/layoutSave";
import { LedCustomSlot } from "../../../api/parsers/ledCustom";
import { LedSavedState, collectLedSlots, ledRefSlots, sortedUnion as sortedSlotUnion, writeLedTable } from "../LedCustom/ledSave";

/* The Combo Editor save. The order is led.custom, superkeys.map, the keymap when a Superkey write made it stale, combos.map, the unused
 * LED slots, the unused Superkeys and the keymap after them, names and the backup. */

export type ComboSaveStep = "ledTable" | "superkeys" | "keymap" | "combos" | "ledGc" | "skgc" | "keymapAfterGc" | "backup";

export interface ComboLedInput {
  table: LedCustomSlot[];
  saved: LedSavedState;
  /* Free the slots nothing references once combos.map is saved */
  collect: boolean;
  /* The keymap, default layers included, and the rules, which this save leaves alone */
  layers: number[][];
  rules: ReadonlyArray<{ output: number }>;
}

export interface ComboSuperkeyInput {
  format: SuperkeyWriteFormat;
  /* The draft table and every reference, with the edited combos */
  draft: SuperkeyDraft;
  saved: SuperkeySavedState;
  /* The layout as the keyboard held it at load or the last save, to tell old clashes from new ones */
  baseline: SuperkeyDraft | null;
  onlyCustom: boolean;
  /* Drop the Superkeys nothing references once combos.map is saved */
  collect: boolean;
  /* From uniqueSuperkeysMode, legacy when left out */
  mode?: UniqueSuperkeysMode;
}

export interface ComboSaveInput {
  combos: ComboType[];
  /* The serialized combos on the keyboard, null when unknown */
  savedCombos: string | null;
  /* Only when the Superkeys and every reference to them are known */
  superkeys?: ComboSuperkeyInput;
  /* Only when the LED table and every reference to it are known */
  ledCustom?: ComboLedInput;
  /* Read the commands the backup records again before it, since a failed read at load stays in the cache */
  rereadBeforeBackup: boolean;
  /* A virtual keyboard keeps the save only in the backup file, so a backup that does not run fails the save */
  isVirtual: boolean;
}

export interface ComboSaveIO {
  /* Each write throws when the keyboard did not store the data */
  writeSuperkeys: (table: number[][], format: SuperkeyWriteFormat, storedRows: number | null) => Promise<number | null>;
  writeKeymap: (serialized: string, onlyCustom: boolean) => Promise<void>;
  writeCombos: (serialized: string) => Promise<void>;
  /* Required with a custom LED effects input */
  writeLedCustom?: (table: LedCustomSlot[]) => Promise<void>;
  /* Store the combo names and the generated Superkey names, which the backup reads */
  storeNames: (combos: ComboType[], table: number[][] | null) => void;
  /* The first command the backup records that can not be read, or null */
  unreadableBeforeBackup: () => Promise<string | null>;
  backup: () => Promise<void>;
}

export type ComboSaveOutcome =
  /* modeUnknown when the Superkey mode is unknown and the legacy checks would merge or clash */
  | { kind: "blocked"; conflicts: Conflict[]; warnings: Conflict[]; modeUnknown?: true }
  | {
      kind: "saved" | "failed";
      /* The steps that wrote, in order */
      done: ComboSaveStep[];
      failed?: ComboSaveStep;
      error?: unknown;
      warnings: Conflict[];
      savedCombos: string | null;
      /* Only with a Superkey input. The table the save ends with, the custom layers the keyboard holds and the saved state, also after a
       * failed step */
      superkeys?: { table: number[][]; layers: number[][]; saved: SuperkeySavedState };
      /* Only with a custom LED effects input. The table the save ends with and the saved state, also after a failed step */
      ledCustom?: { table: LedCustomSlot[]; saved: LedSavedState };
      /* A real keyboard keeps the save when the backup is left out. The command that could not be read, or the backup error */
      backupSkipped?: string;
      backupError?: unknown;
    };

const sortedUnion = (into: number[], slots: number[]): number[] => Array.from(new Set(into.concat(slots))).sort((a, b) => a - b);

/** The slots that some of these references use. */
export const refSlotsOf = (refs: Partial<LayoutRefs>): number[] =>
  [...superkeyRefs({ customLayers: [], defaultLayers: [], layerOffset: 0, rules: [], combos: [], ...refs }).keys()].sort(
    (a, b) => a - b,
  );

const MAX_KEYCODE = 65535;

/* The layers in a keymap reply, or null unless it is whole layers of key codes */
const keymapLayers = (raw: unknown, layerSize: number, allowEmpty: boolean): number[][] | null => {
  if (typeof raw !== "string" || layerSize <= 0) {
    return null;
  }

  const tokens = raw.trim().length === 0 ? [] : raw.trim().split(/\s+/);

  if (tokens.some(token => !/^\d+$/.test(token) || parseInt(token, 10) > MAX_KEYCODE)) {
    return null;
  }

  if (tokens.length % layerSize !== 0 || (tokens.length === 0 && !allowEmpty)) {
    return null;
  }

  const codes = tokens.map(token => parseInt(token, 10));
  return Array.from({ length: codes.length / layerSize }, (_, layer) => codes.slice(layer * layerSize, (layer + 1) * layerSize));
};

/** The keymap replies as layers and the onlyCustom flag, or null when any reply is not exactly what the firmware sends. */
export const readKeymapReplies = (
  replies: { custom: unknown; defaults: unknown; onlyCustom: unknown },
  layerSize: number,
): { custom: number[][]; defaults: number[][]; onlyCustom: boolean } | null => {
  const custom = keymapLayers(replies.custom, layerSize, false);
  const defaults = keymapLayers(replies.defaults, layerSize, true);
  const flag = typeof replies.onlyCustom === "string" ? replies.onlyCustom.trim() : null;

  if (custom === null || defaults === null || (flag !== "0" && flag !== "1")) {
    return null;
  }

  return { custom, defaults, onlyCustom: flag === "1" };
};

/** The keymap an editor loads. Valid replies load as validated, so the layers the editor shows and saves hold every reference. Other
 * replies load as well as they parse, for display only, with `known` false. */
export const loadKeymapReplies = (
  replies: { custom: unknown; defaults: unknown; onlyCustom: unknown },
  layerSize: number,
): { custom: number[][]; defaults: number[][]; onlyCustom: boolean; known: boolean } => {
  const read = readKeymapReplies(replies, layerSize);

  if (read !== null) {
    return { ...read, known: true };
  }

  const asText = (raw: unknown) => (typeof raw === "string" ? raw : "");

  return {
    custom: parseKeymapRaw(asText(replies.custom), layerSize),
    defaults: parseKeymapRaw(asText(replies.defaults), layerSize),
    onlyCustom: Boolean(parseInt(asText(replies.onlyCustom), 10)),
    known: false,
  };
};

/** Save the combos and the Superkeys their outputs use. Stop at the first failed step and report the progress. */
export const runComboSave = async (io: ComboSaveIO, input: ComboSaveInput): Promise<ComboSaveOutcome> => {
  const sk = input.superkeys;
  let warnings: Conflict[] = [];
  let table: number[][] | null = null;
  let layers: number[][] = [];
  /* The custom layers the keyboard holds, which become the merged layers once the keymap write lands */
  let heldLayers: number[][] = sk?.draft.customLayers ?? [];
  let skSaved = sk?.saved;
  let { savedCombos } = input;
  const done: ComboSaveStep[] = [];
  const led = input.ledCustom;
  const sendLedCustom = io.writeLedCustom;
  let ledSaved = led?.saved;
  let ledTable = led?.table;

  if (led && !sendLedCustom) {
    throw new Error("A custom LED effects save needs writeLedCustom");
  }

  if (sk) {
    /* Leave combo outputs out of the clash checks' protection and baseline, since the keyboard never converts them. A combo edit then
     * never turns a clash already on the keyboard into a new one, while table and cell changes still do */
    const prepared = prepareSuperkeyWrite({
      draft: sk.draft,
      saved: { ...sk.saved, comboRefs: [], uncertainCombos: [] },
      baseline: sk.baseline === null ? null : { ...sk.baseline, combos: sk.draft.combos },
      collect: false,
      format: sk.format,
      mode: sk.mode,
    });

    if (prepared.modeUnknown) {
      return { kind: "blocked", conflicts: [], warnings: [], modeUnknown: true };
    }

    if (prepared.conflicts.length > 0) {
      return { kind: "blocked", conflicts: prepared.conflicts, warnings: prepared.warnings };
    }

    ({ warnings } = prepared);
    ({ table, layers } = prepared);
  }

  const outcome = (
    failed?: ComboSaveStep,
    error?: unknown,
    extra: { backupSkipped?: string; backupError?: unknown } = {},
  ): ComboSaveOutcome => ({
    kind: failed === undefined ? "saved" : "failed",
    done,
    failed,
    error,
    warnings,
    savedCombos,
    ...(skSaved && table ? { superkeys: { table, layers: heldLayers, saved: skSaved } } : {}),
    ...(ledSaved && ledTable ? { ledCustom: { table: ledTable, saved: ledSaved } } : {}),
    ...extra,
  });

  /* Write the Superkey table and mark the keymap for a rewrite. On failure the keyboard may hold any part of it */
  const writeTable = async (skInput: ComboSuperkeyInput, state: SuperkeySavedState, next: number[][]): Promise<void> => {
    try {
      const data = serializeSuperkeyTable(next, skInput.format, state.storedRows);
      const storedRows = await io.writeSuperkeys(next, skInput.format, state.storedRows);
      skSaved = { ...state, table: data, storedRows, keymapStale: true, cleanupDone: true };
    } catch (error) {
      skSaved = { ...state, table: null, storedRows: null, keymapStale: true, cleanupDone: true };
      throw error;
    }
  };

  /* Write the keymap. On failure its Superkeys become uncertain */
  const writeLayers = async (skInput: ComboSuperkeyInput, state: SuperkeySavedState): Promise<void> => {
    const keymapSlots = refSlotsOf({
      customLayers: layers,
      defaultLayers: skInput.draft.defaultLayers,
      layerOffset: skInput.draft.layerOffset,
    });

    try {
      await io.writeKeymap(layers.flat().join(" "), skInput.onlyCustom);
    } catch (error) {
      skSaved = { ...state, uncertainKeymap: sortedUnion(state.uncertainKeymap, keymapSlots) };
      throw error;
    }

    skSaved = { ...state, keymapStale: false, keymapRefs: keymapSlots, uncertainKeymap: [] };
    heldLayers = layers;
  };

  /* The LED effects go first, so every slot a combo sends has its settings */
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

  /* Superkeys go first, so every Superkey a combo or key sends is defined */
  if (sk && skSaved && table && superkeyWriteNeeded(sk.format, skSaved, table)) {
    try {
      await writeTable(sk, skSaved, table);
    } catch (error) {
      return outcome("superkeys", error);
    }

    done.push("superkeys");
  }

  /* The keyboard converts dual-function Superkeys only when the keymap is written. Merged cells need the write too */
  if (sk && skSaved && (skSaved.keymapStale || reconcileDraft(sk.draft.customLayers, layers).length > 0)) {
    try {
      await writeLayers(sk, skSaved);
    } catch (error) {
      return outcome("keymap", error);
    }

    done.push("keymap");
  }

  const serialized = serializeCombos(input.combos);
  const comboSlots = refSlotsOf({ combos: input.combos });
  const comboLedSlots = ledRefSlots({ layers: [], combos: input.combos });

  if (serialized !== savedCombos) {
    try {
      await io.writeCombos(serialized);
    } catch (error) {
      /* The write may have landed before its reply failed */
      savedCombos = null;

      if (skSaved) {
        skSaved = { ...skSaved, uncertainCombos: sortedUnion(skSaved.uncertainCombos, comboSlots) };
      }

      if (ledSaved) {
        ledSaved = { ...ledSaved, uncertainCombos: sortedSlotUnion(ledSaved.uncertainCombos, comboLedSlots) };
      }

      return outcome("combos", error);
    }

    savedCombos = serialized;
    done.push("combos");
  }

  if (skSaved) {
    skSaved = { ...skSaved, comboRefs: comboSlots, uncertainCombos: [] };
  }

  if (ledSaved) {
    ledSaved = { ...ledSaved, comboRefs: comboLedSlots, uncertainCombos: [] };
  }

  /* Keep the slots the layout and combos reference and the keyboard may still play, now that combos.map is saved */
  if (led && led.collect && sendLedCustom && ledSaved && ledTable) {
    const collected = collectLedSlots(ledTable, { layers: led.layers, rules: led.rules, combos: input.combos }, ledSaved);

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

  /* Keep what the draft references and what the keyboard may still hold, now that the keymap and combos are saved */
  if (sk && sk.collect && skSaved && table) {
    const refs = { ...sk.draft, customLayers: layers, combos: input.combos };
    const keep = new Set([...superkeyRefs(refs).keys(), ...protectedSlots(skSaved)]);
    const collected = collectSuperkeys(table, keep, collectModeFor(sk.format));

    if (collected !== table) {
      try {
        await writeTable(sk, skSaved, collected);
      } catch (error) {
        return outcome("skgc", error);
      }

      table = collected;
      done.push("skgc");

      try {
        await writeLayers(sk, skSaved);
      } catch (error) {
        return outcome("keymapAfterGc", error);
      }

      done.push("keymapAfterGc");
    }
  }

  io.storeNames(input.combos, table);

  /* Read again first, so the backup never records a failed reply from the load */
  if (input.rereadBeforeBackup) {
    const unreadable = await io.unreadableBeforeBackup();

    if (unreadable !== null) {
      if (input.isVirtual) {
        return outcome("backup", new Error(`${unreadable} could not be read`));
      }

      return outcome(undefined, undefined, { backupSkipped: unreadable });
    }
  }

  try {
    await io.backup();
  } catch (error) {
    if (input.isVirtual) {
      return outcome("backup", error);
    }

    return outcome(undefined, undefined, { backupError: error });
  }

  done.push("backup");
  return outcome();
};
