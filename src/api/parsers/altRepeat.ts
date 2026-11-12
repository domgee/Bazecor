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

import { AltRepeatBlock, AltRepeatLayerEntry, AltRepeatRule } from "@Renderer/types/altRepeat";
import { SuperkeysType } from "@Renderer/types/superkeys";
import { isRepeatKey } from "../../hw/repeatkey";
import { isSwapHandsCode } from "../../hw/swaphands";
import { PARTIAL_HOLD_FLAG, isPartialHold } from "../../hw/layerhold";

/* Previous-key rules, AltRepeatDygma in the Sonsei firmware.
 *
 * The wire format of `altrepeat.map` for read and write is the count, then count x `layer position previous output`.
 * A write is all or nothing. A rejected write keeps the old table and sends no error, so every write is read back.
 */

export const ALT_REPEAT_COMMAND = "altrepeat.map";
export const MAX_ALT_REPEAT_RULES = 128;

/** AltRepeatDygma::REPEAT_FLAG in a rule's previous key. The output repeats on each press until another key types. */
export const ALT_REPEAT_REPEAT_FLAG = 0x8000;

/* Bound the layer by the firmware's uint32 layer state and leave the real layer count to the firmware */
export const LAYER_COUNT_BOUND = 32;

const DUM_FIRST = 49169;
const DUL_FIRST = 51218;
export const DU_FIRST = 49169;
export const DU_LAST = 53266;
const UNSUPPORTED_FIRST = 53267;
const UNSUPPORTED_LAST = 53851;
const AUTOSHIFT_FIRST = 54115;
const AUTOSHIFT_LAST = 54370;
const CAPS_WORD = 54371;
export const MACRO_FIRST = 53852;
const MACRO_COUNT = 128;
export const SUPERKEY_FIRST = 53980;
const SUPERKEY_COUNT = 128;
const TRANSPARENT = 65535;

const CTRL_FLAG = 0x100;
const ALT_FLAG = 0x200;
const ALTGR_FLAG = 0x400;
const SHIFT_FLAG = 0x800;
const GUI_FLAG = 0x1000;
const PREVIOUS_MODS = 0x1b;
const FIRST_TYPING_KEY = 0x04;
const LAST_TYPING_KEY = 0xdd;
const LAYER_HOLD_MASK = 0xe000;
const LAYER_HOLD_BITS = 0x2000;
const LAYER_HOLD_MODS = 0x1f;
const PARTIAL_HOLD_MASK = 0xc000;

const isSuperkeyCode = (code: number) => code >= SUPERKEY_FIRST && code < SUPERKEY_FIRST + SUPERKEY_COUNT;

const isMacroCode = (code: number) => code >= MACRO_FIRST && code < MACRO_FIRST + MACRO_COUNT;

/** Does the firmware's `help` reply list the previous-key command? */
export const hasAltRepeatCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === ALT_REPEAT_COMMAND);
};

/** The previous key of a rule without the repeat flag. */
export const basePrevious = (previous: number): number => previous & ~ALT_REPEAT_REPEAT_FLAG;

export const hasRepeat = (previous: number): boolean => (previous & ALT_REPEAT_REPEAT_FLAG) !== 0;

export const withRepeat = (previous: number, on: boolean): number =>
  on ? previous | ALT_REPEAT_REPEAT_FLAG : basePrevious(previous);

/** The firmware matches Alt with the side ignored, so AltGr becomes Alt. */
export const normalizePrevious = (code: number): number => {
  if ((code & ALTGR_FLAG) === 0) {
    return code;
  }

  return (code & ~ALTGR_FLAG) | ALT_FLAG;
};

/** A key that types, from `a` to the last HID key, with only Ctrl, Alt, Shift and Gui flags and the repeat flag. */
export const isValidPrevious = (code: number): boolean => {
  if (!Number.isInteger(code) || code < 0 || code > 0xffff || basePrevious(code) >= 0x2000) {
    return false;
  }

  const keycode = code & 0xff;
  return ((basePrevious(code) >> 8) & ~PREVIOUS_MODS) === 0 && keycode >= FIRST_TYPING_KEY && keycode <= LAST_TYPING_KEY;
};

/** Mirror of AltRepeatDygma::outputAllowed. */
export const isAllowedOutput = (code: number): boolean => {
  if (!Number.isInteger(code) || code <= 0 || code >= TRANSPARENT) {
    return false;
  }

  if (code >= DU_FIRST && code <= DU_LAST) {
    return false;
  }

  if (code >= AUTOSHIFT_FIRST && code <= AUTOSHIFT_LAST) {
    return false;
  }

  if (isSwapHandsCode(code)) {
    return false;
  }

  /* Take a partial hold only in the shape the firmware accepts. Its table entry is not needed, since a code without one plays plain */
  if ((code & PARTIAL_HOLD_MASK) === PARTIAL_HOLD_FLAG) {
    return isPartialHold(code);
  }

  if ((code & LAYER_HOLD_MASK) !== LAYER_HOLD_BITS) {
    return true;
  }

  /* Take a layer hold shortcut only in the shape LayerHoldMods registers, with a modifier and a typing key */
  const keycode = code & 0xff;
  return ((code >> 8) & LAYER_HOLD_MODS) !== 0 && keycode >= FIRST_TYPING_KEY && keycode <= LAST_TYPING_KEY;
};

/** The modifiers of a previous key, in the order a shortcut is usually read. */
export const previousModifiers = (code: number): ("ctrl" | "alt" | "shift" | "gui")[] => {
  const mods: ("ctrl" | "alt" | "shift" | "gui")[] = [];

  if (code & CTRL_FLAG) {
    mods.push("ctrl");
  }

  if (code & (ALT_FLAG | ALTGR_FLAG)) {
    mods.push("alt");
  }

  if (code & SHIFT_FLAG) {
    mods.push("shift");
  }

  if (code & GUI_FLAG) {
    mods.push("gui");
  }

  return mods;
};

/** The rules in an `altrepeat.map` reply, or null when the reply is not one. */
export const parseAltRepeatRaw = (raw: unknown): AltRepeatRule[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_ALT_REPEAT_RULES || values.length !== 1 + 4 * count || values.some(v => v > 0xffff)) {
    return null;
  }

  const rules: AltRepeatRule[] = [];

  for (let i = 0; i < count; i += 1) {
    const base = 1 + 4 * i;
    rules.push({ layer: values[base], position: values[base + 1], previous: values[base + 2], output: values[base + 3] });
  }

  return rules;
};

/** Sort by layer, then position. Keep the order within a key, which is its tab order. */
const sortRules = (rules: AltRepeatRule[]): AltRepeatRule[] =>
  rules.slice().sort((a, b) => a.layer - b.layer || a.position - b.position);

export const serializeAltRepeat = (rules: AltRepeatRule[]): string => {
  const values = [rules.length];

  sortRules(rules).forEach(rule => {
    values.push(rule.layer, rule.position, rule.previous, rule.output);
  });

  return values.join(" ");
};

/** Why the firmware would reject `rules`, or null when it accepts them. */
export const validateAltRepeatRules = (rules: AltRepeatRule[], layerCount: number, keysPerLayer: number): string | null => {
  if (rules.length > MAX_ALT_REPEAT_RULES) {
    return `more than ${MAX_ALT_REPEAT_RULES} rules`;
  }

  const seen = new Set<string>();

  for (let i = 0; i < rules.length; i += 1) {
    const { layer, position, previous, output } = rules[i];

    if (!Number.isInteger(layer) || layer < 0 || layer >= layerCount) {
      return `rule ${i} is on layer ${layer}, outside the ${layerCount} layers`;
    }

    if (!Number.isInteger(position) || position < 0 || position >= keysPerLayer) {
      return `rule ${i} is on key ${position}, outside the ${keysPerLayer} keys`;
    }

    if (!isValidPrevious(previous)) {
      return `rule ${i} has the previous key ${previous}, which does not type`;
    }

    if (!isAllowedOutput(output)) {
      return `rule ${i} has the output ${output}, which the firmware does not run`;
    }

    const key = `${layer} ${position} ${basePrevious(previous)}`;

    if (seen.has(key)) {
      return `rule ${i} repeats the previous key of another rule on the same key`;
    }

    seen.add(key);
  }

  return null;
};

/** Indexes into `rules` of the rules on one key, in tab order. */
export const rulesAt = (rules: AltRepeatRule[], layer: number, position: number): number[] =>
  rules.reduce<number[]>((found, rule, index) => {
    if (rule.layer === layer && rule.position === position) {
      found.push(index);
    }

    return found;
  }, []);

/* ------------------------------------------------------------------------ */
/* Superkeys the firmware stores as dual-function keys                      */
/* ------------------------------------------------------------------------ */

/* Utils::ranges (Superkeys/includes.h). The table is not sorted, so the search misses ranges exactly as
 * ActionsDriver::find_key_type does */
const SK_RANGES: [number, number][] = [
  [17492, 17501],
  [17152, 17154],
  [53852, 53979],
  [256, 7935],
  [0, 255],
  [17450, 17459],
  [23785, 23786],
];
const KEY_RANGE_LAYER_LOCK = 0;
const KEY_RANGE_LAYER_SHIFT = 5;
const LAYER_LOCK_FIRST = 17492;
const LAYER_SHIFT_FIRST = 17450;

/** ActionsDriver::find_key_type, the same binary search. -1 when nothing is found. */
export const findKeyType = (value: number): number => {
  let start = 0;
  let end = SK_RANGES.length - 1;

  while (start <= end) {
    const mid = start + Math.floor((end - start) / 2);

    if (value >= SK_RANGES[mid][0] && value <= SK_RANGES[mid][1]) {
      return mid;
    }

    if (value < SK_RANGES[mid][0]) {
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }

  return -1;
};

/* KeyRoleManager::has_layer_change */
const hasLayerChange = (raw: number) => [KEY_RANGE_LAYER_LOCK, KEY_RANGE_LAYER_SHIFT].includes(findKeyType(raw));

/* KeyRoleManager::is_only_modifier, which only looks at the low byte */
const isOnlyModifier = (raw: number) => (raw & 0xff) >= 0xe0 && (raw & 0xff) <= 0xe7;

/* Bazecor sends 0, null and missing actions as 1, the firmware's idle value. 65535 is not idle */
const isIdle = (action: number | undefined | null) => action === undefined || action === null || action === 0 || action === 1;

/* hidModToDumIndex in KeyRoleManager.cpp. The 0x100 bit marks a right modifier */
const hidModToDumIndex = (hid: number): number => {
  const right = (hid & 0x100) !== 0;
  const mod = hid & 0xff;

  if (mod <= 0xe3) {
    return mod - 0xe0 + (right ? 4 : 0);
  }

  return mod - 0xe0;
};

/** KeyRoleManager::calculate_qukey_code. 0 when the HOLD is neither a modifier nor a layer change. */
export const superkeyQukeyCode = (tap: number, hold: number): number => {
  const offset = (((tap >> 8) & 0xff) !== 0 ? 128 : 0) + (tap & 0x7f);

  if (!hasLayerChange(hold)) {
    const hid = hold & 0x1ff;

    if ((hid >= 0xe0 && hid <= 0xe7) || (hid >= 0x1e0 && hid <= 0x1e7)) {
      return DUM_FIRST + hidModToDumIndex(hid) * 256 + offset;
    }

    return 0;
  }

  const type = findKeyType(hold);
  let layer = -1;

  if (type === KEY_RANGE_LAYER_SHIFT) {
    layer = hold - LAYER_SHIFT_FIRST;
  } else if (type === KEY_RANGE_LAYER_LOCK) {
    layer = hold - LAYER_LOCK_FIRST;
  }

  return layer < 0 ? 0 : DUL_FIRST + layer * 256 + offset;
};

/* The holds a native dual-use keycode carries that Bazecor and Lens label: left Ctrl, Shift, Alt, GUI and right Alt */
const DU_MODIFIER_HOLDS = [0xe0, 0xe1, 0xe2, 0xe3, 0xe6];
const DU_LAYERS = 8;
const DU_TAP_LAST = 0x7f;
const DU_KEYS_PER_HOLD = 256;

/** The native dual-use keycode for a tap and a hold, or null when no DUM or DUL code carries them. */
export const dualUseCodeFor = (tap: number, hold: number): number | null => {
  if (!Number.isInteger(tap) || tap < FIRST_TYPING_KEY || tap > DU_TAP_LAST) {
    return null;
  }

  if (DU_MODIFIER_HOLDS.includes(hold)) {
    return DUM_FIRST + hidModToDumIndex(hold) * DU_KEYS_PER_HOLD + tap;
  }

  if (Number.isInteger(hold) && hold >= LAYER_SHIFT_FIRST && hold < LAYER_SHIFT_FIRST + DU_LAYERS) {
    return DUL_FIRST + (hold - LAYER_SHIFT_FIRST) * DU_KEYS_PER_HOLD + tap;
  }

  return null;
};

/** The tap and hold of a native dual-use keycode, or null when the code is not one. */
export const decodeDualUse = (code: number): { tap: number; hold: number } | null => {
  if (!Number.isInteger(code) || code < DU_FIRST || code > DU_LAST) {
    return null;
  }

  const base = code < DUL_FIRST ? DUM_FIRST : DUL_FIRST;
  const tap = (code - base) % DU_KEYS_PER_HOLD;
  const index = Math.floor((code - base) / DU_KEYS_PER_HOLD);

  if (tap === 0) {
    return null;
  }

  if (base === DUM_FIRST) {
    return { tap, hold: 0xe0 + index };
  }

  return { tap, hold: LAYER_SHIFT_FIRST + index };
};

/** KeyRoleManager::search_and_replace. True when the firmware stores this Superkey as a dual-function key. */
export const isDualFunctionSuperkey = (superkey: SuperkeysType | undefined): boolean => {
  if (!superkey) {
    return false;
  }

  const [tap, hold, action2, action3, action4] = superkey.actions;

  if (isIdle(tap) || isIdle(hold) || !isIdle(action2) || !isIdle(action3) || !isIdle(action4)) {
    return false;
  }

  if (tap >= LAYER_LOCK_FIRST && tap <= LAYER_LOCK_FIRST + 9) {
    return false;
  }

  if (isOnlyModifier(tap & 0xff)) {
    return false;
  }

  if (!isOnlyModifier(hold) && !hasLayerChange(hold)) {
    return false;
  }

  const code = superkeyQukeyCode(tap, hold);
  return code >= DU_FIRST && code <= DU_LAST;
};

/** KeyRoleManager::determine_key_role. True when the firmware registers this Superkey under a qukey code, which a keymap cell with
 * that code then plays. Unlike isDualFunctionSuperkey a modifier tap counts, since only the cell conversion skips it. */
export const isRegisteredQukeySuperkey = (superkey: SuperkeysType | undefined): boolean => {
  if (!superkey) {
    return false;
  }

  const [tap, hold, action2, action3, action4] = superkey.actions;

  if (isIdle(tap) || isIdle(hold) || !isIdle(action2) || !isIdle(action3) || !isIdle(action4)) {
    return false;
  }

  if (tap >= LAYER_LOCK_FIRST && tap <= LAYER_LOCK_FIRST + 9) {
    return false;
  }

  if (!isOnlyModifier(hold) && !hasLayerChange(hold)) {
    return false;
  }

  const code = superkeyQukeyCode(tap, hold);
  return code >= DU_FIRST && code <= DU_LAST;
};

const SYNTHETIC_OR_RESERVED = 0xc0;
const MAX_ACTIVE_SUPERKEYS = 70;

/** KeyRoleManager::dual_function_rule on firmware with `superkeys.unique`. True when Qukeys plays this Superkey as a dual-function key. */
export const isUniqueDualFunctionSuperkey = (superkey: SuperkeysType | undefined): boolean => {
  if (!superkey) {
    return false;
  }

  const [tap, hold, action2, action3, action4] = superkey.actions;

  if (isIdle(tap) || isIdle(hold) || !isIdle(action2) || !isIdle(action3) || !isIdle(action4)) {
    return false;
  }

  if (tap === TRANSPARENT || hold === TRANSPARENT) {
    return false;
  }

  if ((tap >= LAYER_LOCK_FIRST && tap <= LAYER_LOCK_FIRST + 9) || isOnlyModifier(tap)) {
    return false;
  }

  if (hold >= LAYER_SHIFT_FIRST && hold <= LAYER_SHIFT_FIRST + 9) {
    return true;
  }

  return ((hold >> 8) & SYNTHETIC_OR_RESERVED) === 0 && isOnlyModifier(hold);
};

/** True when the firmware plays this Superkey as a dual-function key, by the unique or the legacy rule. */
export const playsAsDualFunction = (superkey: SuperkeysType | undefined, unique: boolean): boolean =>
  unique ? isUniqueDualFunctionSuperkey(superkey) : isDualFunctionSuperkey(superkey);

/** True when `code` is a Superkey the firmware plays as a dual-function key. The unique firmware only runs slots below 70. */
export const isDualFunctionSuperkeyCode = (code: number, superkeys: SuperkeysType[], unique: boolean): boolean => {
  if (!isSuperkeyCode(code)) {
    return false;
  }

  const slot = code - SUPERKEY_FIRST;
  return (!unique || slot < MAX_ACTIVE_SUPERKEYS) && playsAsDualFunction(superkeys[slot], unique);
};

/* AltRepeatDygma::replaysCell fires a rule on a dual-function cell only when the resolved tap is a plain or modified key, not a modifier */
const tapReplays = (superkey: SuperkeysType | undefined): boolean => {
  const tap = superkey?.actions[0] ?? 0;
  const keycode = tap & 0xff;

  return ((tap >> 8) & SYNTHETIC_OR_RESERVED) === 0 && keycode !== 0 && !isOnlyModifier(keycode);
};

/* A Superkey whose rules replace its tap, by the firmware's Superkey rule and the replay check */
const tapRuleSuperkey = (code: number, superkeys: SuperkeysType[], unique: boolean): boolean =>
  isDualFunctionSuperkeyCode(code, superkeys, unique) && tapReplays(superkeys[code - SUPERKEY_FIRST]);

/** Why a key with this default cannot have previous-key rules, or null when it can. Pass `repeatKeyRules` when the firmware applies them on Repeat. */
export const altRepeatDefaultBlock = (
  code: number,
  superkeys: SuperkeysType[] = [],
  unique = false,
  repeatKeyRules = false,
): AltRepeatBlock | null => {
  if (code === TRANSPARENT) {
    return "transparent";
  }

  if (code >= AUTOSHIFT_FIRST && code <= AUTOSHIFT_LAST) {
    return "autoshift";
  }

  if (code === CAPS_WORD) {
    return "capsword";
  }

  if (isSwapHandsCode(code)) {
    return "swaphands";
  }

  /* Check before the unsupported range, which holds the Repeat key */
  if (isRepeatKey(code)) {
    return repeatKeyRules ? null : "repeatkey";
  }

  if (code >= UNSUPPORTED_FIRST && code <= UNSUPPORTED_LAST) {
    return "unsupported";
  }

  if (isSuperkeyCode(code) && !tapRuleSuperkey(code, superkeys, unique)) {
    return "superkey";
  }

  return null;
};

/** True when a rule on this default replaces only the tap and keeps the hold. */
export const replacesTap = (code: number, superkeys: SuperkeysType[] = [], unique = false): boolean =>
  (code >= DU_FIRST && code <= DU_LAST) || tapRuleSuperkey(code, superkeys, unique);

/* ------------------------------------------------------------------------ */
/* Table operations. Each returns a new table and leaves its input alone    */
/* ------------------------------------------------------------------------ */

export type AltRepeatCapacityError = { error: "capacity" };

/** The firmware layer count of a keymap as Bazecor holds it. */
export const firmwareLayerCount = (keymap: { custom: unknown[]; default: unknown[]; onlyCustom: boolean }): number =>
  keymap.custom.length + (keymap.onlyCustom ? 0 : keymap.default.length);

/** Drop the rules on `layer`, or only those on `positions` when given. */
export const clearLayerRules = (rules: AltRepeatRule[], layer: number, positions?: Set<number>): AltRepeatRule[] =>
  rules.filter(rule => rule.layer !== layer || (positions !== undefined && !positions.has(rule.position)));

/** Give `targetLayer` the rules of `sourceLayer`, or none when the source has no rules of its own. */
export const copyLayerRules = (
  rules: AltRepeatRule[],
  sourceLayer: number | null,
  targetLayer: number,
): { rules: AltRepeatRule[] } | AltRepeatCapacityError => {
  const copied =
    sourceLayer === null ? [] : rules.filter(rule => rule.layer === sourceLayer).map(rule => ({ ...rule, layer: targetLayer }));
  const next = clearLayerRules(rules, targetLayer).concat(copied);

  if (next.length > MAX_ALT_REPEAT_RULES) {
    return { error: "capacity" };
  }

  return { rules: next };
};

/* Valid rules from a file, AltGr folded into Alt. Drop later duplicates of a previous key, also when only the flag differs */
const cleanEntries = (
  entries: unknown[],
  layerCount: number,
  keysPerLayer: number,
  keepRepeat: boolean,
): { rules: AltRepeatRule[]; dropped: number } => {
  const rules: AltRepeatRule[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  entries.forEach(entry => {
    const { layer, position, previous, output } = (entry ?? {}) as Partial<AltRepeatRule>;
    const normalized =
      typeof previous === "number" ? withRepeat(normalizePrevious(previous), keepRepeat && hasRepeat(previous)) : NaN;
    const key = `${layer} ${position} ${basePrevious(normalized)}`;
    const valid =
      Number.isInteger(layer) &&
      layer >= 0 &&
      layer < layerCount &&
      Number.isInteger(position) &&
      position >= 0 &&
      position < keysPerLayer &&
      isValidPrevious(normalized) &&
      isAllowedOutput(output) &&
      !seen.has(key);

    if (!valid) {
      dropped += 1;
      return;
    }

    seen.add(key);
    rules.push({ layer, position, previous: normalized, output });
  });

  return { rules, dropped };
};

/** Replace the rules on `layer` with a single-layer file's entries. Without `keepRepeat` drop the repeat flag. */
export const replaceLayerRules = (
  rules: AltRepeatRule[],
  layer: number,
  entries: unknown[],
  keysPerLayer: number,
  keepRepeat = true,
): { rules: AltRepeatRule[]; dropped: number } | AltRepeatCapacityError => {
  const layered = entries.map(entry => ({ ...((entry ?? {}) as AltRepeatLayerEntry), layer }));
  const cleaned = cleanEntries(layered, layer + 1, keysPerLayer, keepRepeat);
  const next = clearLayerRules(rules, layer).concat(cleaned.rules);

  if (next.length > MAX_ALT_REPEAT_RULES) {
    return { error: "capacity" };
  }

  return { rules: next, dropped: cleaned.dropped };
};

/** Replace every rule with an all-layers file's entries. Without `keepRepeat` drop the repeat flag. */
export const replaceAllRules = (
  entries: unknown[],
  layerCount: number,
  keysPerLayer: number,
  keepRepeat = true,
): { rules: AltRepeatRule[]; dropped: number } | AltRepeatCapacityError => {
  const cleaned = cleanEntries(entries, layerCount, keysPerLayer, keepRepeat);

  if (cleaned.rules.length > MAX_ALT_REPEAT_RULES) {
    return { error: "capacity" };
  }

  return cleaned;
};

/** Follow a macro deletion. Rules on the deleted macro move to the replacement or go when there is none. */
export const remapMacroOutputs = (rules: AltRepeatRule[], deletedIdx: number, replacementIdx: number): AltRepeatRule[] =>
  rules.reduce<AltRepeatRule[]>((next, rule) => {
    if (rule.output === MACRO_FIRST + deletedIdx) {
      if (replacementIdx !== -1) {
        next.push({ ...rule, output: MACRO_FIRST + replacementIdx });
      }

      return next;
    }

    if (isMacroCode(rule.output) && rule.output > MACRO_FIRST + deletedIdx) {
      next.push({ ...rule, output: rule.output - 1 });
      return next;
    }

    next.push(rule);
    return next;
  }, []);

/** Follow a Superkey deletion. Rules on the deleted Superkey go and higher Superkeys move down. */
export const remapSuperkeyOutputs = (rules: AltRepeatRule[], deletedIdx: number): AltRepeatRule[] =>
  rules.reduce<AltRepeatRule[]>((next, rule) => {
    if (rule.output === SUPERKEY_FIRST + deletedIdx) {
      return next;
    }

    if (isSuperkeyCode(rule.output) && rule.output > SUPERKEY_FIRST + deletedIdx) {
      next.push({ ...rule, output: rule.output - 1 });
      return next;
    }

    next.push(rule);
    return next;
  }, []);

export const rulesUsingOutput = (rules: AltRepeatRule[], code: number): number =>
  rules.filter(rule => rule.output === code).length;

/** True when a restore must clear the rules, because the keyboard has them and the backup does not. */
export const needsAltRepeatClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(ALT_REPEAT_COMMAND) && !commands.includes(ALT_REPEAT_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface AltRepeatDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** The rules on the keyboard, or null when they could not be read. */
export const readAltRepeatRules = async (device: AltRepeatDevice): Promise<AltRepeatRule[] | null> => {
  try {
    return parseAltRepeatRaw(await device.noCacheCommand(ALT_REPEAT_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the rules and read them back. Throw unless the keyboard holds exactly what was sent. */
export const writeAltRepeatRules = async (
  device: AltRepeatDevice,
  rules: AltRepeatRule[],
  layerCount: number,
  keysPerLayer: number,
): Promise<void> => {
  const invalid = validateAltRepeatRules(rules, layerCount, keysPerLayer);

  if (invalid !== null) {
    throw new Error(`Previous-key rules not sent: ${invalid}`);
  }

  const sent = serializeAltRepeat(rules);
  const written = await device.noCacheCommand(ALT_REPEAT_COMMAND, sent);

  if (written instanceof Error) {
    throw written;
  }

  const reply = await device.noCacheCommand(ALT_REPEAT_COMMAND);

  if (reply instanceof Error) {
    throw reply;
  }

  const stored = parseAltRepeatRaw(reply);

  if (stored === null || serializeAltRepeat(stored) !== sent) {
    throw new Error("The keyboard did not store the previous-key rules");
  }
};

/** Restore an `altrepeat.map` backup entry. The firmware checks the real layer count, and the read-back catches a rejection. */
export const restoreAltRepeat = async (device: AltRepeatDevice, data: string, keysPerLayer: number): Promise<void> => {
  const rules = parseAltRepeatRaw(data);

  if (rules === null) {
    throw new Error(`Malformed ${ALT_REPEAT_COMMAND} backup entry`);
  }

  await writeAltRepeatRules(device, rules, LAYER_COUNT_BOUND, keysPerLayer);
};
