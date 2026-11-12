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

import { HoldModsEntry, HoldModsState } from "@Renderer/types/holdMods";
import { ALT_REPEAT_COMMAND, hasAltRepeatCommand, parseAltRepeatRaw } from "../../../api/parsers/altRepeat";
import { HoldModsDevice, hasHoldModsCommand, readHoldMods } from "../../../api/parsers/holdMods";
import { HoldBaseline, keymapSaveKey } from "./layoutSave";

/* Only the Sonsei firmware has the held modifiers table */
export const HOLD_MODS_PRODUCT = "Sonsei";

export interface HoldModsLoad {
  state: HoldModsState;
  table: HoldModsEntry[];
  /* `help` lists the previous-key rules, so the table is settled only once they load */
  helpListsAltRepeat: boolean;
  /* The keyboard's keymap and rules, read uncached, when the state is "ready" */
  baseline?: HoldBaseline;
}

const readUncached = async (device: HoldModsDevice, command: string): Promise<string | null> => {
  try {
    const reply = await device.noCacheCommand(command);
    return typeof reply === "string" ? reply : null;
  } catch (error) {
    return null;
  }
};

/* Device caches a write's arguments even when it failed, so only uncached reads say what the keyboard holds */
const readBaseline = async (device: HoldModsDevice, helpListsAltRepeat: boolean): Promise<HoldBaseline | null> => {
  const custom = await readUncached(device, "keymap.custom");
  const onlyCustom = await readUncached(device, "keymap.onlyCustom");

  if (custom === null || onlyCustom === null || !/^\d+$/.test(onlyCustom.trim())) {
    return null;
  }

  const tokens = custom.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const ruleRefs = helpListsAltRepeat ? parseAltRepeatRaw(await readUncached(device, ALT_REPEAT_COMMAND)) : [];

  if (ruleRefs === null) {
    return null;
  }

  const keymapCodes = tokens.map(token => parseInt(token, 10));
  return { keymap: keymapSaveKey(keymapCodes, parseInt(onlyCustom, 10) !== 0), keymapCodes, ruleRefs };
};

/** Load the table for the Layout editor. An unreadable `help` or keymap stays "loading", so Save keeps working and a later load retries. */
export const loadHoldModsForEditor = async (device: HoldModsDevice, product: string | undefined): Promise<HoldModsLoad> => {
  if (product !== HOLD_MODS_PRODUCT) {
    return { state: "unsupported", table: [], helpListsAltRepeat: false };
  }

  const help = await readUncached(device, "help");

  if (help === null || help.trim().length === 0) {
    return { state: "loading", table: [], helpListsAltRepeat: false };
  }

  const helpListsAltRepeat = hasAltRepeatCommand(help);

  if (!hasHoldModsCommand(help)) {
    return { state: "unsupported", table: [], helpListsAltRepeat };
  }

  const table = await readHoldMods(device);

  if (table === null) {
    return { state: "failed", table: [], helpListsAltRepeat };
  }

  const baseline = await readBaseline(device, helpListsAltRepeat);

  if (baseline === null) {
    return { state: "loading", table: [], helpListsAltRepeat };
  }

  return { state: "ready", table, helpListsAltRepeat, baseline };
};
