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

import { KeyOverride } from "@Renderer/types/keyOverrides";

/* QMK-style key overrides, KeyOverridesDygma in the Sonsei firmware.
 *
 * The wire format of `keyoverrides.map` for read and write is the count, then count x
 * `trigger triggerMods layers negativeMods suppressedMods replacement options enabled`. List order is priority.
 * A write is all or nothing. A rejected write keeps the old table and replies `error`. The virtual keyboard echoes the payload
 * instead, so every write is read back.
 */

export const KEY_OVERRIDES_COMMAND = "keyoverrides.map";
export const MAX_KEY_OVERRIDES = 32;
export const KO_LAYER_COUNT = 10;
export const KO_ALL_LAYERS = 0x3ff;

export const MOD_CTRL = 0x01;
export const MOD_ALT = 0x02;
export const MOD_ALTGR = 0x04;
export const MOD_SHIFT = 0x08;
export const MOD_GUI = 0x10;
export const MODS_MASK = 0x1b;
export const REPLACEMENT_MODS = 0x1f;

export const KO_TRIGGER_DOWN = 0x01;
export const KO_REQUIRED_MOD_DOWN = 0x02;
export const KO_NEGATIVE_MOD_UP = 0x04;
export const KO_ONE_MOD = 0x08;
export const KO_NO_REREGISTER = 0x10;
export const KO_NO_UNREGISTER_ON_OTHER = 0x20;
export const KO_OPTIONS_DEFAULT = 0x07;
export const KO_OPTIONS_MASK = 0x3f;

const KO_ACTIVATION_MASK = 0x07;
const FIRST_KEY = 0x04;
const LAST_KEY = 0xdd;
const FIELDS = 8;

/** The modifiers of a mask in the order a shortcut is usually read. */
export const KO_MODIFIERS: { bit: number; name: "ctrl" | "alt" | "shift" | "gui" }[] = [
  { bit: MOD_CTRL, name: "ctrl" },
  { bit: MOD_ALT, name: "alt" },
  { bit: MOD_SHIFT, name: "shift" },
  { bit: MOD_GUI, name: "gui" },
];

const isByteMask = (value: number, mask: number) => Number.isInteger(value) && value >= 0 && (value & ~mask) === 0;

const isKeycode = (keycode: number) => keycode >= FIRST_KEY && keycode <= LAST_KEY;

/** Does the firmware's `help` reply list the key overrides command? */
export const hasKeyOverridesCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === KEY_OVERRIDES_COMMAND);
};

/** The overrides in a `keyoverrides.map` reply, or null when the reply is not one. */
export const parseKeyOverridesRaw = (raw: unknown): KeyOverride[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_KEY_OVERRIDES || values.length !== 1 + FIELDS * count || values.some(v => v > 0xffff)) {
    return null;
  }

  const list: KeyOverride[] = [];

  for (let i = 0; i < count; i += 1) {
    const [trigger, triggerMods, layers, negativeMods, suppressedMods, replacement, options, enabled] = values.slice(
      1 + FIELDS * i,
      1 + FIELDS * (i + 1),
    );

    /* Take only the firmware's 0 and 1, so a malformed entry fails instead of turning into an enabled override */
    if (enabled > 1) {
      return null;
    }

    list.push({ trigger, triggerMods, layers, negativeMods, suppressedMods, replacement, options, enabled: enabled === 1 });
  }

  return list;
};

export const serializeKeyOverrides = (list: KeyOverride[]): string => {
  const values = [list.length];

  list.forEach(o => {
    values.push(
      o.trigger,
      o.triggerMods,
      o.layers,
      o.negativeMods,
      o.suppressedMods,
      o.replacement,
      o.options,
      o.enabled ? 1 : 0,
    );
  });

  return values.join(" ");
};

export const isValidTrigger = (trigger: number): boolean => Number.isInteger(trigger) && isKeycode(trigger);

/** 0 blocks the key. Anything else is a keyboard key with Ctrl, Alt, AltGr, Shift and Gui flags only. */
export const isValidReplacement = (code: number): boolean => {
  if (code === 0) {
    return true;
  }

  return isByteMask(code, 0xffff) && ((code >> 8) & ~REPLACEMENT_MODS) === 0 && isKeycode(code & 0xff);
};

/** Mirror of KeyOverridesDygma::overrideAllowed. Why the firmware would reject `o`, or null when it accepts it. */
export const validateKeyOverride = (o: KeyOverride): string | null => {
  if (!isValidTrigger(o.trigger)) {
    return `the trigger ${o.trigger} is not a keyboard key`;
  }

  if (
    !isByteMask(o.triggerMods, MODS_MASK) ||
    !isByteMask(o.negativeMods, MODS_MASK) ||
    !isByteMask(o.suppressedMods, MODS_MASK)
  ) {
    return "a modifier mask has a bit other than Ctrl, Alt, Shift and Gui";
  }

  if ((o.triggerMods & o.negativeMods) !== 0) {
    return "a modifier is both required and forbidden";
  }

  if (!isByteMask(o.layers, KO_ALL_LAYERS) || o.layers === 0) {
    return `the layer mask ${o.layers} is empty or has a layer above ${KO_LAYER_COUNT}`;
  }

  if (!isByteMask(o.options, KO_OPTIONS_MASK)) {
    return `the options ${o.options} have an unknown bit`;
  }

  if (typeof o.enabled !== "boolean") {
    return "enabled is not a boolean";
  }

  if (!isValidReplacement(o.replacement)) {
    return `the replacement ${o.replacement} is not a keyboard key or a block`;
  }

  return null;
};

/** Why the firmware would reject `list`, or null when it accepts it. */
export const validateKeyOverrides = (list: KeyOverride[]): string | null => {
  if (list.length > MAX_KEY_OVERRIDES) {
    return `more than ${MAX_KEY_OVERRIDES} overrides`;
  }

  for (let i = 0; i < list.length; i += 1) {
    const invalid = validateKeyOverride(list[i]);

    if (invalid !== null) {
      return `override ${i}: ${invalid}`;
    }
  }

  return null;
};

/** A picked key as a trigger, with AltGr folded into Alt as the firmware matches it, or null when it can not be one. */
export const splitTriggerCode = (code: number): { trigger: number; triggerMods: number } | null => {
  if (!isByteMask(code, 0xffff)) {
    return null;
  }

  const flags = code >> 8;
  const trigger = code & 0xff;

  if ((flags & ~REPLACEMENT_MODS) !== 0 || !isKeycode(trigger)) {
    return null;
  }

  return { trigger, triggerMods: (flags & MODS_MASK) | (flags & MOD_ALTGR ? MOD_ALT : 0) };
};

/** The trigger with its required modifiers as a Bazecor keycode. */
export const triggerCode = (o: KeyOverride): number => (o.triggerMods << 8) | o.trigger;

/** A new override with QMK's defaults, on all layers, suppressing the required modifiers. */
export const newKeyOverride = (trigger: number, triggerMods: number, replacement: number): KeyOverride => ({
  trigger,
  triggerMods,
  layers: KO_ALL_LAYERS,
  negativeMods: 0,
  suppressedMods: triggerMods,
  replacement,
  options: KO_OPTIONS_DEFAULT,
  enabled: true,
});

/** Change the required modifiers. Suppression follows when it equalled them, and a newly required modifier is no longer forbidden. */
export const withTriggerMods = (o: KeyOverride, mods: number): KeyOverride => ({
  ...o,
  triggerMods: mods,
  suppressedMods: o.suppressedMods === o.triggerMods ? mods : o.suppressedMods,
  negativeMods: o.negativeMods & ~mods,
});

/** Move the override at `from` to `to`. Return the list unchanged when either is out of range. */
export const moveKeyOverride = <T>(list: T[], from: number, to: number): T[] => {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) {
    return list;
  }

  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/** The activation bits the firmware applies. QMK treats no activation bit as all of them. */
export const effectiveActivation = (options: number): number => options & KO_ACTIVATION_MASK || KO_ACTIVATION_MASK;

/** Whether an option shows as on. The activation bits show as the firmware applies them. */
export const optionChecked = (options: number, bit: number): boolean => {
  const shown = (bit & KO_ACTIVATION_MASK) !== 0 ? (options & ~KO_ACTIVATION_MASK) | effectiveActivation(options) : options;
  return (shown & bit) !== 0;
};

/** True for the only activation bit still on, which can not be cleared, since no activation bit means all of them. */
export const isLastActivation = (options: number, bit: number): boolean => effectiveActivation(options) === bit;

/** Flip one option. Flip an activation bit from what the firmware applies, and keep at least one activation bit on. */
export const toggleOption = (options: number, bit: number): number => {
  if ((bit & KO_ACTIVATION_MASK) === 0) {
    return options ^ bit;
  }

  if (isLastActivation(options, bit)) {
    return options;
  }

  return (options & ~KO_ACTIVATION_MASK) | (effectiveActivation(options) ^ bit);
};

/** True when one_mod makes any one of several required modifiers enough. */
export const anyOneRequired = (o: KeyOverride): boolean =>
  (o.options & KO_ONE_MOD) !== 0 && KO_MODIFIERS.filter(mod => (o.triggerMods & mod.bit) !== 0).length > 1;

/** The first earlier enabled override that always wins over the one at `index`, or -1. The firmware uses the first match in list order. */
export const overlapsEarlier = (list: KeyOverride[], index: number): number => {
  const o = list[index];

  if (!o) {
    return -1;
  }

  return list
    .slice(0, index)
    .findIndex(
      earlier =>
        earlier.enabled &&
        earlier.trigger === o.trigger &&
        earlier.triggerMods === o.triggerMods &&
        earlier.negativeMods === o.negativeMods &&
        (earlier.options & KO_ONE_MOD) === (o.options & KO_ONE_MOD) &&
        (o.layers & ~earlier.layers) === 0 &&
        (effectiveActivation(o.options) & ~effectiveActivation(earlier.options)) === 0,
    );
};

/** The allowed layers with Bazecor's 1-based labels, runs joined as `1-3`, or `allLabel` for every layer. */
export const layerSummary = (layers: number, allLabel: string): string => {
  if ((layers & KO_ALL_LAYERS) === KO_ALL_LAYERS) {
    return allLabel;
  }

  const runs: string[] = [];
  let layer = 0;

  while (layer < KO_LAYER_COUNT) {
    if ((layers & (1 << layer)) !== 0) {
      const start = layer;

      while (layer + 1 < KO_LAYER_COUNT && (layers & (1 << (layer + 1))) !== 0) {
        layer += 1;
      }

      runs.push(start === layer ? `${start + 1}` : `${start + 1}-${layer + 1}`);
    }

    layer += 1;
  }

  return runs.join(", ");
};

/** True when a restore must clear the overrides, because the keyboard has them and the backup does not. */
export const needsKeyOverridesClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(KEY_OVERRIDES_COMMAND) && !commands.includes(KEY_OVERRIDES_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface KeyOverridesDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** The overrides on the keyboard, or null when they could not be read. */
export const readKeyOverrides = async (device: KeyOverridesDevice): Promise<KeyOverride[] | null> => {
  try {
    return parseKeyOverridesRaw(await device.noCacheCommand(KEY_OVERRIDES_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the overrides and read them back. Throw unless the keyboard holds exactly what was sent. */
export const writeKeyOverrides = async (device: KeyOverridesDevice, list: KeyOverride[]): Promise<void> => {
  const invalid = validateKeyOverrides(list);

  if (invalid !== null) {
    throw new Error(`Key overrides not sent: ${invalid}`);
  }

  const sent = serializeKeyOverrides(list);
  let stored: KeyOverride[] | null;

  try {
    const written = await device.noCacheCommand(KEY_OVERRIDES_COMMAND, sent);

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the payload. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error("The keyboard rejected the key overrides");
    }

    const reply = await device.noCacheCommand(KEY_OVERRIDES_COMMAND);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = parseKeyOverridesRaw(reply);
  } catch (error) {
    /* Device caches the table it sent. Read what the keyboard holds, so a later backup does not record the unsent table */
    try {
      await device.noCacheCommand(KEY_OVERRIDES_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* The read-back already put the keyboard's table in the cache */
  if (stored === null || serializeKeyOverrides(stored) !== sent) {
    throw new Error("The keyboard did not store the key overrides");
  }
};

/** Restore a `keyoverrides.map` backup entry. */
export const restoreKeyOverrides = async (device: KeyOverridesDevice, data: string): Promise<void> => {
  const list = parseKeyOverridesRaw(data);

  if (list === null) {
    throw new Error(`Malformed ${KEY_OVERRIDES_COMMAND} backup entry`);
  }

  await writeKeyOverrides(device, list);
};
