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
import { isSwapHandsCode } from "../../hw/swaphands";
import { SUPERKEY_FIRST, isDualFunctionSuperkeyCode } from "./altRepeat";
import { VALID_POSITIONS } from "./dualFunction";

/* Handle the dominant layer of the Sonsei firmware's DominantLayer plugin.
 *
 * `dominant.map` reads and writes the dominant layer per matrix position (row * 12 + col) as the count, then count x `<pos> <layer>`,
 * where the layer is the firmware index 1..9. The keyboard sends the positions in ascending order and `0` for an empty map. A write
 * replaces the whole map and keeps the timeout.
 * `dominant.timeout` reads and writes the wait in ms as a decimal from 10 to 250. A write keeps the map.
 * A rejected write keeps the old values and replies `error`. The virtual keyboard echoes the payload instead, so every write is read back.
 */

export const DOMINANT_MAP_COMMAND = "dominant.map";
export const DOMINANT_TIMEOUT_COMMAND = "dominant.timeout";

export const DOMINANT_TIMEOUT_MIN = 10;
export const DOMINANT_TIMEOUT_MAX = 250;
export const DOMINANT_TIMEOUT_DEFAULT = 60;
export const DOMINANT_LAYER_MIN = 1;
export const DOMINANT_LAYER_MAX = 9;
export const MAX_DOMINANT = VALID_POSITIONS.length;

/** Warning for a dominant layer entry the restore skipped, because the keyboard does not list its command. */
export const DOMINANT_NOT_RESTORED = "The dominant layer settings were not restored, because the keyboard does not support them.";

const LAYER_KEY_FIRST = 17408;
const LAYER_KEY_LAST = 17663;
const LAYER_SHIFT_FIRST = 17450;
const LAYER_SHIFT_LAST = 17459;
const OSL_FIRST = 49161;
const OSL_LAST = 49168;
const DUL_FIRST = 51218;
const DUL_LAST = 53266;
const TRANSPARENT = 65535;

/** The dominant layer of one matrix position, as the firmware layer index. */
export interface DominantEntry {
  position: number;
  layer: number;
}

/** Return true when the firmware's `help` reply lists both dominant layer commands. */
export const hasDominantCommands = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  const lines = help.split(/\r?\n/).map(line => line.trim());
  return lines.includes(DOMINANT_MAP_COMMAND) && lines.includes(DOMINANT_TIMEOUT_COMMAND);
};

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/* ------------------------------------------------------------------------ */
/* Map                                                                      */
/* ------------------------------------------------------------------------ */

/** Mirror the firmware's map write. Return why the keyboard would reject `list`, or null when it accepts it. */
export const validateDominantMap = (list: DominantEntry[]): string | null => {
  if (list.length > MAX_DOMINANT) {
    return `more than ${MAX_DOMINANT} keys`;
  }

  const seen = new Set<number>();

  for (let i = 0; i < list.length; i += 1) {
    const { position, layer } = list[i];

    if (!VALID_POSITIONS.includes(position)) {
      return `key ${i}: the position ${position} is not a Sonsei key`;
    }

    if (!isIntIn(layer, DOMINANT_LAYER_MIN, DOMINANT_LAYER_MAX)) {
      return `key ${i}: the layer ${layer} is not an integer from ${DOMINANT_LAYER_MIN} to ${DOMINANT_LAYER_MAX}`;
    }

    if (seen.has(position)) {
      return `key ${i}: repeats the position ${position}`;
    }

    seen.add(position);
  }

  return null;
};

/** Serialize the map as the keyboard sends it, sorted by position, so a read-back compares equal. */
export const serializeDominantMap = (list: DominantEntry[]): string => {
  const sorted = [...list].sort((a, b) => a.position - b.position);
  return [sorted.length, ...sorted.flatMap(entry => [entry.position, entry.layer])].join(" ");
};

/** Return the map in a `dominant.map` reply or backup entry, sorted by position, or null when it is not one the keyboard accepts. */
export const parseDominantMap = (raw: unknown): DominantEntry[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const text = raw.trim();

  /* Reject a line break inside the value, since the firmware reads the map from one line */
  if (/[\r\n]/.test(text)) {
    return null;
  }

  const tokens = text.split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_DOMINANT || values.length !== 1 + 2 * count) {
    return null;
  }

  const list: DominantEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    list.push({ position: values[1 + 2 * i], layer: values[2 + 2 * i] });
  }

  if (validateDominantMap(list) !== null) {
    return null;
  }

  return list.sort((a, b) => a.position - b.position);
};

/** Return the dominant layer of `position`, or null when it has none. */
export const dominantAt = (list: DominantEntry[], position: number): number | null =>
  list.find(entry => entry.position === position)?.layer ?? null;

/** Return a copy of `list` with `position` set to `layer`, or with its entry removed when `layer` is null. */
export const setDominant = (list: DominantEntry[], position: number, layer: number | null): DominantEntry[] => {
  const rest = list.filter(entry => entry.position !== position);

  if (layer === null) {
    return rest;
  }

  return [...rest, { position, layer }].sort((a, b) => a.position - b.position);
};

/** Mirror the firmware's changesLayer. Return true when a layer-0 cell with `code` changes the layer, so it cannot have a dominant layer. */
export const dominantRefusal = (code: number, superkeys: SuperkeysType[]): boolean => {
  if (code >= LAYER_KEY_FIRST && code <= LAYER_KEY_LAST) {
    return true;
  }

  if (code >= OSL_FIRST && code <= OSL_LAST) {
    return true;
  }

  /* A dual-function layer key holds Layer Shift to its layer */
  if (code >= DUL_FIRST && code <= DUL_LAST) {
    const hold = LAYER_SHIFT_FIRST + Math.floor((code - DUL_FIRST) / 256);
    return hold <= LAYER_SHIFT_LAST;
  }

  /* The dominant layer firmware has unique Superkeys */
  if (isDualFunctionSuperkeyCode(code, superkeys, true)) {
    const hold = superkeys[code - SUPERKEY_FIRST].actions[1];
    return hold >= LAYER_SHIFT_FIRST && hold <= LAYER_SHIFT_LAST;
  }

  return isSwapHandsCode(code);
};

/** How the firmware treats the cell on the dominant layer. It ignores the entry for a Transparent or swap hands cell, so the key acts at
 * once. "unknown" is a layer the loaded keymap lacks. */
export type DominantTarget = "active" | "transparent" | "swap" | "unknown";

/** Return how the firmware treats a dominant layer whose cell holds `code`. */
export const dominantTarget = (code: number | undefined): DominantTarget => {
  if (code === undefined) {
    return "unknown";
  }

  if (code === TRANSPARENT) {
    return "transparent";
  }

  return isSwapHandsCode(code) ? "swap" : "active";
};

/* ------------------------------------------------------------------------ */
/* Timeout                                                                  */
/* ------------------------------------------------------------------------ */

/** Accept only an integer from DOMINANT_TIMEOUT_MIN to DOMINANT_TIMEOUT_MAX. */
export const isValidDominantTimeout = (value: unknown): value is number =>
  isIntIn(value, DOMINANT_TIMEOUT_MIN, DOMINANT_TIMEOUT_MAX);

/** Return the timeout in a reply or backup entry, or null when it is not one. */
export const parseDominantTimeout = (raw: unknown): number | null => {
  if (typeof raw !== "string") {
    return null;
  }

  const text = raw.trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const value = parseInt(text, 10);
  return isValidDominantTimeout(value) ? value : null;
};

/* ------------------------------------------------------------------------ */
/* Restore decisions                                                        */
/* ------------------------------------------------------------------------ */

/** Return true when a restore must empty the map, because the keyboard has it and the original backup lacks it. */
export const needsDominantClear = (originalCommands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(DOMINANT_MAP_COMMAND) && !originalCommands.includes(DOMINANT_MAP_COMMAND);

/** Return true when a restore must reset the timeout, because the keyboard has it and the original backup lacks it. */
export const needsDominantTimeoutReset = (originalCommands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(DOMINANT_TIMEOUT_COMMAND) && !originalCommands.includes(DOMINANT_TIMEOUT_COMMAND);

/** Return the warning when a restore drops a dominant layer entry of the original backup, because the keyboard does not list its command. */
export const dominantFilteredWarning = (originalCommands: string[], supported: Set<string> | null): string | undefined => {
  const dropped = originalCommands.some(
    command =>
      (command === DOMINANT_MAP_COMMAND || command === DOMINANT_TIMEOUT_COMMAND) && supported !== null && !supported.has(command),
  );

  return dropped ? DOMINANT_NOT_RESTORED : undefined;
};

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface DominantDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

const readParsed = async <T>(device: DominantDevice, command: string, parse: (raw: unknown) => T | null): Promise<T | null> => {
  try {
    return parse(await device.noCacheCommand(command));
  } catch (error) {
    return null;
  }
};

/* Write `sent` and read it back uncached. Throw unless the keyboard holds exactly what was sent */
const writeChecked = async (
  device: DominantDevice,
  command: string,
  sent: string,
  readBack: (raw: unknown) => string | null,
  what: string,
): Promise<void> => {
  let stored: string | null;

  try {
    const written = await device.noCacheCommand(command, sent);

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the payload. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error(`The keyboard rejected the ${what}`);
    }

    const reply = await device.noCacheCommand(command);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = readBack(reply);

    /* Refresh the cache below, so an unreadable reply is not left there for the next backup */
    if (stored === null) {
      throw new Error(`The keyboard did not store the ${what}`);
    }
  } catch (error) {
    /* Replace the unsent payload in the Device cache with the keyboard's, so a later backup does not record it */
    try {
      await device.noCacheCommand(command);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* Skip the refresh, since the read-back already cached the keyboard's value */
  if (stored !== sent) {
    throw new Error(`The keyboard did not store the ${what}`);
  }
};

const mapReadBack = (raw: unknown): string | null => {
  const list = parseDominantMap(raw);
  return list === null ? null : serializeDominantMap(list);
};

const timeoutReadBack = (raw: unknown): string | null => {
  const value = parseDominantTimeout(raw);
  return value === null ? null : String(value);
};

/** Return the map on the keyboard, or null when it cannot be read. */
export const readDominantMap = (device: DominantDevice): Promise<DominantEntry[] | null> =>
  readParsed(device, DOMINANT_MAP_COMMAND, parseDominantMap);

/** Return the timeout on the keyboard, or null when it cannot be read. */
export const readDominantTimeout = (device: DominantDevice): Promise<number | null> =>
  readParsed(device, DOMINANT_TIMEOUT_COMMAND, parseDominantTimeout);

/** Write the map, replacing the keyboard's, and read it back. Throw unless the keyboard holds exactly what was sent. */
export const writeDominantMap = async (device: DominantDevice, list: DominantEntry[]): Promise<void> => {
  const invalid = validateDominantMap(list);

  if (invalid !== null) {
    throw new Error(`Dominant layer map not sent: ${invalid}`);
  }

  await writeChecked(device, DOMINANT_MAP_COMMAND, serializeDominantMap(list), mapReadBack, "dominant layer map");
};

/** Write the timeout and read it back. Throw unless the keyboard holds exactly the value sent. */
export const writeDominantTimeout = async (device: DominantDevice, value: number): Promise<void> => {
  if (!isValidDominantTimeout(value)) {
    throw new Error(
      `Dominant layer timeout not sent: ${value} is not an integer from ${DOMINANT_TIMEOUT_MIN} to ${DOMINANT_TIMEOUT_MAX}`,
    );
  }

  await writeChecked(device, DOMINANT_TIMEOUT_COMMAND, String(value), timeoutReadBack, "dominant layer timeout");
};

/** Restore a `dominant.map` backup entry. Throw on a malformed entry without sending anything. */
export const restoreDominantMap = async (device: DominantDevice, data: string): Promise<void> => {
  const list = parseDominantMap(data);

  if (list === null) {
    throw new Error(`Malformed ${DOMINANT_MAP_COMMAND} backup entry`);
  }

  await writeDominantMap(device, list);
};

/** Restore a `dominant.timeout` backup entry. Throw on a malformed entry without sending anything. */
export const restoreDominantTimeout = async (device: DominantDevice, data: string): Promise<void> => {
  const value = parseDominantTimeout(data);

  if (value === null) {
    throw new Error(`Malformed ${DOMINANT_TIMEOUT_COMMAND} backup entry`);
  }

  await writeDominantTimeout(device, value);
};

/** Save the timeout from Preferences, which comes last before the post-save backup. Write a timeout that was read. Otherwise read it
 * again, so the Device cache holds the keyboard's timeout and not a failed reply, and throw when it still cannot be read. */
export const saveDominantTimeout = async (device: DominantDevice, timeout: number): Promise<void> => {
  if (timeout >= 0) {
    await writeDominantTimeout(device, timeout);
    return;
  }

  if ((await readDominantTimeout(device)) === null) {
    throw new Error("Could not read the dominant layer timeout");
  }
};
