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
import { isLayerHold, isPartialHold, holdShortcut, shortcutMods } from "../../hw/layerhold";

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
