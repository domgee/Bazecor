/* eslint-disable no-bitwise */
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
import { HoldModsEntry, HoldModsTarget } from "@Renderer/types/holdMods";
import {
  canHoldUntilLayerChange,
  holdShortcut,
  isLayerHold,
  isPartialHold,
  shortcutMods,
  toLayerHold,
  toPartialHold,
} from "../../hw/layerhold";

/* Held modifiers of partial hold codes, LayerHoldModsDygma in the Sonsei firmware.
 *
 * The wire format of `holdmods.map` for read and write is the count, then count x `code held`.
 * A write is all or nothing. A rejected write keeps the old table and replies `error`. The virtual keyboard echoes the payload
 * instead, so every write is read back.
 */

export const HOLD_MODS_COMMAND = "holdmods.map";
export const MAX_HOLD_MODS = 32;

/* Restore warnings, shown through restoreWarnings.tsx */
export const HOLD_MODS_NORMALIZED = "Partial layer holds restored as plain shortcuts: the keyboard does not list holdmods.map";
export const HOLD_MODS_NOT_RESTORED = "Held modifiers not restored: the keyboard does not list holdmods.map";

const KEYMAP_COMMAND = "keymap.custom";
const FIELDS = 2;

/** Does the firmware's `help` reply list the held modifiers command? */
export const hasHoldModsCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === HOLD_MODS_COMMAND);
};

/** The entries in a `holdmods.map` reply, or null when the reply is not one. */
export const parseHoldModsRaw = (raw: unknown): HoldModsEntry[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_HOLD_MODS || values.length !== 1 + FIELDS * count || values.some(v => v > 0xffff)) {
    return null;
  }

  const list: HoldModsEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    const [code, held] = values.slice(1 + FIELDS * i, 1 + FIELDS * (i + 1));

    /* The firmware stores the held mask in a byte */
    if (held > 0xff) {
      return null;
    }

    list.push({ code, held });
  }

  return list;
};

/** Sort by code, so the same table always serializes the same way. */
export const serializeHoldMods = (list: HoldModsEntry[]): string => {
  const values = [list.length];

  list
    .slice()
    .sort((a, b) => a.code - b.code)
    .forEach(entry => {
      values.push(entry.code, entry.held);
    });

  return values.join(" ");
};

/** Mirror of LayerHoldModsDygma::entryAllowed. Why the firmware would reject `entry`, or null when it accepts it. */
export const validateHoldModsEntry = (entry: HoldModsEntry): string | null => {
  if (!isPartialHold(entry.code)) {
    return `the code ${entry.code} is not a partial hold`;
  }

  const mods = shortcutMods(entry.code);

  if (!Number.isInteger(entry.held) || entry.held <= 0 || (entry.held & ~mods) !== 0) {
    return `the held modifiers ${entry.held} are not modifiers of the code ${entry.code}`;
  }

  if (entry.held === mods) {
    return `the code ${entry.code} holds all its modifiers`;
  }

  return null;
};

/** Mirror of LayerHoldModsDygma::tableAllowed. Why the firmware would reject `list`, or null when it accepts it. */
export const validateHoldMods = (list: HoldModsEntry[]): string | null => {
  if (list.length > MAX_HOLD_MODS) {
    return `more than ${MAX_HOLD_MODS} entries`;
  }

  for (let i = 0; i < list.length; i += 1) {
    const invalid = validateHoldModsEntry(list[i]);

    if (invalid !== null) {
      return `entry ${i}: ${invalid}`;
    }

    for (let j = 0; j < i; j += 1) {
      if (list[j].code === list[i].code) {
        return `entry ${i}: repeats the code of entry ${j}`;
      }
    }
  }

  return null;
};

/** The modifiers a hold code holds. All for a legacy hold, the entry's for a partial hold, none for an orphan or any other key. */
export const heldMaskOf = (table: HoldModsEntry[], code: number): number => {
  if (isLayerHold(code)) {
    return shortcutMods(code);
  }

  if (!isPartialHold(code)) {
    return 0;
  }

  const entry = table.find(e => e.code === code);
  return entry ? entry.held & shortcutMods(code) : 0;
};

/** The plain shortcut for a partial hold code, any other code unchanged. */
export const plainPartialHold = (code: number): number => (isPartialHold(code) ? holdShortcut(code) : code);

/** A keymap reply with its partial hold codes made plain. Return `raw` itself when it has none. */
export const plainPartialHoldsRaw = (raw: string): string => {
  const tokens = raw.trim().split(/\s+/);

  if (!tokens.some(token => /^\d+$/.test(token) && isPartialHold(parseInt(token, 10)))) {
    return raw;
  }

  return tokens.map(token => (/^\d+$/.test(token) ? String(plainPartialHold(parseInt(token, 10))) : token)).join(" ");
};

/** The rules with their partial hold outputs made plain. Return `rules` itself when none has one. */
export const plainHoldOutputs = (rules: AltRepeatRule[]): AltRepeatRule[] => {
  if (!rules.some(rule => isPartialHold(rule.output))) {
    return rules;
  }

  return rules.map(rule => ({ ...rule, output: plainPartialHold(rule.output) }));
};

/** The layers with their partial hold codes made plain. Return `layers` itself when none has one. */
export const plainPartialHoldLayers = (layers: number[][]): number[][] => {
  if (!layers.some(layer => layer.some(isPartialHold))) {
    return layers;
  }

  return layers.map(layer => layer.map(plainPartialHold));
};

/* ------------------------------------------------------------------------ */
/* Editor allocation. Each returns a new table and leaves its input alone    */
/* ------------------------------------------------------------------------ */

/** A draft cell, as custom layer index and position, or a rule index that holdCodeRefs leaves out. */
export type HoldRefSkip = { layer: number; position: number } | { rule: number };

/** "slots" means both slots of the shortcut hold other modifiers in use, "capacity" that the table is full. */
export type HoldAllocError = { error: "slots" | "capacity" };

/** The partial hold codes the layers and the rule outputs use, without `skip`. */
export const holdCodeRefs = (layers: number[][], rules: AltRepeatRule[], skip?: HoldRefSkip): Set<number> => {
  const refs = new Set<number>();

  layers.forEach((layer, layerIndex) => {
    layer.forEach((code, position) => {
      const skipped = skip !== undefined && "position" in skip && skip.layer === layerIndex && skip.position === position;

      if (!skipped && isPartialHold(code)) {
        refs.add(code);
      }
    });
  });

  rules.forEach((rule, index) => {
    const skipped = skip !== undefined && "rule" in skip && skip.rule === index;

    if (!skipped && isPartialHold(rule.output)) {
      refs.add(rule.output);
    }
  });

  return refs;
};

/** The code for `shortcut` with the modifiers in `held` held, and the table it needs. Never change the meaning of a code in `used`. */
export const encodeHold = (
  shortcut: number,
  held: number,
  table: HoldModsEntry[],
  used: Set<number>,
): { code: number; table: HoldModsEntry[] } | HoldAllocError => {
  const plain = holdShortcut(shortcut);
  const mods = shortcutMods(plain);
  const kept = held & mods;

  if (!canHoldUntilLayerChange(plain) || kept === 0) {
    return { code: plain, table };
  }

  if (kept === mods) {
    return { code: toLayerHold(plain), table };
  }

  const slots = [toPartialHold(plain, 0), toPartialHold(plain, 1)];
  const reused = slots.find(code => table.some(entry => entry.code === code && entry.held === kept));

  if (reused !== undefined) {
    return { code: reused, table };
  }

  const rewritten = slots.find(code => !used.has(code) && table.some(entry => entry.code === code));

  if (rewritten !== undefined) {
    return { code: rewritten, table: table.map(entry => (entry.code === rewritten ? { code: rewritten, held: kept } : entry)) };
  }

  /* A slot without an entry that a key or rule still uses is an orphan playing the plain shortcut, so it stays occupied */
  const free = slots.find(code => !used.has(code));

  if (free === undefined) {
    return { error: "slots" };
  }

  const pruned = table.length < MAX_HOLD_MODS ? table : table.filter(entry => used.has(entry.code));

  if (pruned.length >= MAX_HOLD_MODS) {
    return { error: "capacity" };
  }

  return { code: free, table: pruned.concat([{ code: free, held: kept }]) };
};

/** The layers and rules with their orphan partial codes, those without an entry, made plain. Return the inputs themselves when unchanged. */
export const canonicalHoldSave = (
  layers: number[][],
  rules: AltRepeatRule[],
  table: HoldModsEntry[],
): { layers: number[][]; rules: AltRepeatRule[] } => {
  const orphan = (code: number): boolean => isPartialHold(code) && !table.some(entry => entry.code === code);
  const fix = (code: number): number => (orphan(code) ? holdShortcut(code) : code);

  return {
    layers: layers.some(layer => layer.some(orphan))
      ? layers.map(layer => (layer.some(orphan) ? layer.map(fix) : layer))
      : layers,
    rules: rules.some(rule => orphan(rule.output))
      ? rules.map(rule => (orphan(rule.output) ? { ...rule, output: fix(rule.output) } : rule))
      : rules,
  };
};

/** The entries a code in `refs` uses. Return `table` itself when it keeps them all. */
export const gcHoldMods = (table: HoldModsEntry[], refs: Set<number>): HoldModsEntry[] => {
  const kept = table.filter(entry => refs.has(entry.code));
  return kept.length === table.length ? table : kept;
};

/** The entries the codes of an exported layer use, sorted by code. */
export const layerHoldModsExport = (table: HoldModsEntry[], codes: number[]): HoldModsEntry[] => {
  const used = new Set(codes);

  return table
    .filter(entry => used.has(entry.code))
    .sort((a, b) => a.code - b.code)
    .map(({ code, held }) => ({ code, held }));
};

const fileEntryFor = (fileEntries: unknown, code: number): HoldModsEntry | undefined => {
  if (!Array.isArray(fileEntries)) {
    return undefined;
  }

  return fileEntries
    .map(raw => (raw ?? {}) as Partial<HoldModsEntry>)
    .filter(entry => typeof entry.code === "number" && typeof entry.held === "number")
    .map(entry => ({ code: entry.code, held: entry.held }))
    .find(entry => entry.code === code && validateHoldModsEntry(entry) === null);
};

/** Fit the partial codes of an import into `table`. Map each code to one with the file's held modifiers, or to plain without a valid file entry. */
export const importHoldMods = (
  table: HoldModsEntry[],
  used: Set<number>,
  importedCodes: number[],
  fileEntries: unknown,
): { table: HoldModsEntry[]; remap: Map<number, number>; normalized: boolean } | HoldAllocError => {
  const partials = Array.from(new Set(importedCodes.filter(isPartialHold))).sort((a, b) => a - b);
  /* Codes this import already gave a meaning count as used for the next one */
  const taken = new Set(used);
  const remap = new Map<number, number>();
  let next = table;
  let normalized = false;

  for (let i = 0; i < partials.length; i += 1) {
    const code = partials[i];
    const entry = fileEntryFor(fileEntries, code);

    if (entry === undefined) {
      remap.set(code, holdShortcut(code));
      normalized = true;
    } else {
      const encoded = encodeHold(holdShortcut(code), entry.held, next, taken);

      if ("error" in encoded) {
        return encoded;
      }

      next = encoded.table;
      taken.add(encoded.code);
      remap.set(code, encoded.code);
    }
  }

  return { table: next, remap, normalized };
};

/** Fit an import into the editor. Firmware without the table gets every partial code plain, other firmware goes through importHoldMods. */
export const fitHoldImport = (
  supported: boolean,
  table: HoldModsEntry[],
  used: Set<number>,
  importedCodes: number[],
  fileEntries: unknown,
): { table: HoldModsEntry[]; remap: Map<number, number>; normalized: boolean } | HoldAllocError => {
  if (supported) {
    return importHoldMods(table, used, importedCodes, fileEntries);
  }

  const remap = new Map<number, number>(importedCodes.filter(isPartialHold).map(code => [code, holdShortcut(code)]));
  return { table, remap, normalized: remap.size > 0 };
};

/** Classify a target from its `help` commands, null when `help` could not be read. */
export const holdModsTargetOf = (supported: Set<string> | null): HoldModsTarget => {
  if (supported === null) {
    return "unreadable";
  }

  return supported.has(HOLD_MODS_COMMAND) ? "listed" : "unlisted";
};

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface HoldModsDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** Read `help` uncached and classify the target. A failed, empty or non-text reply is "unreadable". */
export const readHoldModsTarget = async (device: HoldModsDevice): Promise<HoldModsTarget> => {
  let help: unknown;

  try {
    help = await device.noCacheCommand("help");
  } catch (error) {
    return "unreadable";
  }

  if (typeof help !== "string" || help.trim().length === 0) {
    return "unreadable";
  }

  return hasHoldModsCommand(help) ? "listed" : "unlisted";
};

/** Send a write uncached and throw when it fails. Device returns undefined on a closed port and the Error itself on a failed request. */
export const writeUncached = async (device: HoldModsDevice, command: string, data: string): Promise<void> => {
  const written = await device.noCacheCommand(command, data);

  if (written !== undefined && !(written instanceof Error)) {
    return;
  }

  /* Device caches what it sent. Read what the keyboard holds, so a later cached read does not return the unsent data */
  try {
    await device.noCacheCommand(command);
  } catch (refreshError) {
    /* Keep the write's own error */
  }

  throw written instanceof Error ? written : new Error(`The keyboard did not answer the ${command} write`);
};

/** The table on the keyboard, or null when it could not be read. */
export const readHoldMods = async (device: HoldModsDevice): Promise<HoldModsEntry[] | null> => {
  try {
    return parseHoldModsRaw(await device.noCacheCommand(HOLD_MODS_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the table and read it back. Throw unless the keyboard holds exactly what was sent. */
export const writeHoldMods = async (device: HoldModsDevice, list: HoldModsEntry[]): Promise<void> => {
  const invalid = validateHoldMods(list);

  if (invalid !== null) {
    throw new Error(`Held modifiers not sent: ${invalid}`);
  }

  const sent = serializeHoldMods(list);
  let stored: HoldModsEntry[] | null;

  try {
    const written = await device.noCacheCommand(HOLD_MODS_COMMAND, sent);

    if (written === undefined) {
      throw new Error(`The keyboard did not answer the ${HOLD_MODS_COMMAND} write`);
    }

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the payload. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error("The keyboard rejected the held modifiers");
    }

    const reply = await device.noCacheCommand(HOLD_MODS_COMMAND);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = parseHoldModsRaw(reply);
  } catch (error) {
    /* Device caches the table it sent. Read what the keyboard holds, so a later backup does not record the unsent table */
    try {
      await device.noCacheCommand(HOLD_MODS_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* The read-back already put the keyboard's table in the cache */
  if (stored === null || serializeHoldMods(stored) !== sent) {
    throw new Error("The keyboard did not store the held modifiers");
  }
};

/** Restore a `holdmods.map` backup entry. Write nothing and return a warning when the target does not list the table. */
export const restoreHoldMods = async (
  device: HoldModsDevice,
  data: string,
  target: HoldModsTarget,
): Promise<string | undefined> => {
  if (target !== "listed") {
    return HOLD_MODS_NOT_RESTORED;
  }

  const list = parseHoldModsRaw(data);

  if (list === null) {
    throw new Error(`Malformed ${HOLD_MODS_COMMAND} backup entry`);
  }

  await writeHoldMods(device, list);
  return undefined;
};

/** Restore a `keymap.custom` backup entry. Check the write on a target with the table, and make partial holds plain on any other target. */
export const restoreHoldKeymap = async (
  device: HoldModsDevice,
  data: string,
  target: HoldModsTarget,
  sendPlain: () => Promise<unknown>,
): Promise<string | undefined> => {
  if (target === "listed") {
    /* A failed keymap write must stop the restore before the table is installed */
    await writeUncached(device, KEYMAP_COMMAND, data);
    return undefined;
  }

  const plain = plainPartialHoldsRaw(data);

  if (plain === data) {
    await sendPlain();
    return undefined;
  }

  await writeUncached(device, KEYMAP_COMMAND, plain);
  return HOLD_MODS_NORMALIZED;
};
