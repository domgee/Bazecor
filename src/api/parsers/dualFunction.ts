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

import { QUICK_TAP_MAX } from "./quickTap";

/* Handle the dual-function key options of the Sonsei firmware's Qukeys.
 *
 * `qukeys.dualFunction` reads and writes the global options as seven decimals,
 * `<mode> <chordal> <speculative> <oneKey> <flowTerm> <retro> <neutralizer>`.
 * `qukeys.perKey` reads and writes the overrides per matrix position (row * 12 + col) as the count, then count x
 * `<pos> <holdTimeout> <quickTapTerm> <priorInterval> <mode> <chordal> <speculative> <retro>`. 65535, 255 and 3 mean use the global
 * setting. The keyboard only sends positions with an override, in ascending order, and a write replaces the whole table.
 * A rejected write keeps the old values and replies `error`. The virtual keyboard echoes the payload instead, so every write is read back.
 */

export const DUAL_FUNCTION_COMMAND = "qukeys.dualFunction";
export const PER_KEY_COMMAND = "qukeys.perKey";

export const MODE_PERMISSIVE = 0;
export const MODE_HOLD_ON_OTHER_KEY = 1;
export const MODE_TIMEOUT_ONLY = 2;
export const DUAL_FUNCTION_MODES = [MODE_PERMISSIVE, MODE_HOLD_ON_OTHER_KEY, MODE_TIMEOUT_ONLY];

export const PER_KEY_HOLD_MIN = 1;
export const PER_KEY_HOLD_MAX = 2000;
export const FLOW_TERM_MAX = 250;
export const PRIOR_MAX = 254;
export { QUICK_TAP_MAX };

const GLOBAL_U16 = 0xffff;
const GLOBAL_U8 = 0xff;
const GLOBAL_FIELD = 3;
const GLOBALS_FIELDS = 7;
const PER_KEY_FIELDS = 8;

const POSITIONS = 60;
const COLS = 12;
const COLS_PER_HAND = 6;
const THUMB_ROW = 4;
const FIRST_MISSING_POS = 52;
const LAST_MISSING_POS = 55;

/** The matrix positions the Sonsei has. Row 4 columns 4..7 do not exist. */
export const VALID_POSITIONS: number[] = Array.from({ length: POSITIONS }, (_, pos) => pos).filter(
  pos => pos < FIRST_MISSING_POS || pos > LAST_MISSING_POS,
);
export const MAX_PER_KEY = VALID_POSITIONS.length;

/** The neutralizer keys Preferences offers. The firmware accepts any HID key from 0x04 to 0xDD and any modifier. */
export const NEUTRALIZER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Off" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: 0x68 + i, label: `F${13 + i}` })),
  { value: 0xe4, label: "Right Ctrl" },
];

export interface DualFunctionGlobals {
  mode: number;
  chordal: boolean;
  speculative: boolean;
  speculativeOneKey: boolean;
  speculativeFlowTerm: number;
  retro: boolean;
  neutralizer: number;
}

/** Every option off, as the keyboard starts after a flash. */
export const DUAL_FUNCTION_DEFAULTS: Readonly<DualFunctionGlobals> = Object.freeze({
  mode: MODE_PERMISSIVE,
  chordal: false,
  speculative: false,
  speculativeOneKey: false,
  speculativeFlowTerm: 0,
  retro: false,
  neutralizer: 0,
});

/** The overrides of one matrix position. Null means the key uses the global setting. */
export interface PerKeyOverride {
  position: number;
  holdTimeout: number | null;
  quickTapTerm: number | null;
  priorInterval: number | null;
  mode: number | null;
  chordal: boolean | null;
  speculative: boolean | null;
  retro: boolean | null;
}

export type Hand = "left" | "right" | "thumb";

/** Return true when the firmware's `help` reply lists both dual-function commands. */
export const hasDualFunctionCommands = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  const lines = help.split(/\r?\n/).map(line => line.trim());
  return lines.includes(DUAL_FUNCTION_COMMAND) && lines.includes(PER_KEY_COMMAND);
};

const isIntIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

/** Mirror the firmware's neutralizerAllowed. Accept 0 (off), 0x04..0xDD and the modifiers 0xE0..0xE7. */
export const isValidNeutralizer = (value: unknown): value is number =>
  value === 0 || isIntIn(value, 0x04, 0xdd) || isIntIn(value, 0xe0, 0xe7);

/** Return the hand of a matrix position, or null for a position the Sonsei lacks. The thumb row counts as either hand. */
export const handOfPosition = (position: number): Hand | null => {
  if (!VALID_POSITIONS.includes(position)) {
    return null;
  }

  if (Math.floor(position / COLS) === THUMB_ROW) {
    return "thumb";
  }

  return position % COLS < COLS_PER_HAND ? "left" : "right";
};

/* Split a reply into the unsigned decimals the firmware's readValue accepts, or return null */
const parseDecimals = (raw: unknown): number[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  return values.every(v => v <= 0xffff) ? values : null;
};

/* ------------------------------------------------------------------------ */
/* Global options                                                           */
/* ------------------------------------------------------------------------ */

/** Mirror the firmware's readDualFunction. Return why the keyboard would reject `g`, or null when it accepts it. */
export const validateDualFunctionGlobals = (g: DualFunctionGlobals): string | null => {
  if (!isIntIn(g.mode, MODE_PERMISSIVE, MODE_TIMEOUT_ONLY)) {
    return `the mode ${g.mode} is not one of 0, 1 and 2`;
  }

  if (![g.chordal, g.speculative, g.speculativeOneKey, g.retro].every(flag => typeof flag === "boolean")) {
    return "an on/off option is not a boolean";
  }

  if (!isIntIn(g.speculativeFlowTerm, 0, FLOW_TERM_MAX)) {
    return `the flow term ${g.speculativeFlowTerm} is not an integer from 0 to ${FLOW_TERM_MAX}`;
  }

  if (!isValidNeutralizer(g.neutralizer)) {
    return `the neutralizer ${g.neutralizer} is not 0, a key from 4 to 221 or a modifier from 224 to 231`;
  }

  return null;
};

export const serializeDualFunctionGlobals = (g: DualFunctionGlobals): string =>
  [
    g.mode,
    g.chordal ? 1 : 0,
    g.speculative ? 1 : 0,
    g.speculativeOneKey ? 1 : 0,
    g.speculativeFlowTerm,
    g.retro ? 1 : 0,
    g.neutralizer,
  ].join(" ");

/** Return the options in a `qukeys.dualFunction` reply or backup entry, or null when it is not one the keyboard accepts. */
export const parseDualFunctionGlobals = (raw: unknown): DualFunctionGlobals | null => {
  const values = parseDecimals(raw);

  if (
    values === null ||
    values.length !== GLOBALS_FIELDS ||
    [values[1], values[2], values[3], values[5]].some(flag => flag > 1)
  ) {
    return null;
  }

  const globals: DualFunctionGlobals = {
    mode: values[0],
    chordal: values[1] === 1,
    speculative: values[2] === 1,
    speculativeOneKey: values[3] === 1,
    speculativeFlowTerm: values[4],
    retro: values[5] === 1,
    neutralizer: values[6],
  };

  return validateDualFunctionGlobals(globals) === null ? globals : null;
};

/* ------------------------------------------------------------------------ */
/* Per-key overrides                                                        */
/* ------------------------------------------------------------------------ */

/** Return true when every field of `o` uses the global setting. */
export const isOverrideEmpty = (o: PerKeyOverride): boolean =>
  o.holdTimeout === null &&
  o.quickTapTerm === null &&
  o.priorInterval === null &&
  o.mode === null &&
  o.chordal === null &&
  o.speculative === null &&
  o.retro === null;

const isTriState = (value: unknown): boolean => value === null || typeof value === "boolean";

/** Mirror the firmware's keyAllowed for one override. Return why the keyboard would reject it, or null when it accepts it. */
export const validatePerKeyOverride = (o: PerKeyOverride): string | null => {
  if (!VALID_POSITIONS.includes(o.position)) {
    return `the position ${o.position} is not a Sonsei key`;
  }

  if (o.holdTimeout !== null && !isIntIn(o.holdTimeout, PER_KEY_HOLD_MIN, PER_KEY_HOLD_MAX)) {
    return `the hold timeout ${o.holdTimeout} is not an integer from ${PER_KEY_HOLD_MIN} to ${PER_KEY_HOLD_MAX}`;
  }

  if (o.quickTapTerm !== null && !isIntIn(o.quickTapTerm, 0, QUICK_TAP_MAX)) {
    return `the quick tap term ${o.quickTapTerm} is not an integer from 0 to ${QUICK_TAP_MAX}`;
  }

  if (o.priorInterval !== null && !isIntIn(o.priorInterval, 0, PRIOR_MAX)) {
    return `the prior interval ${o.priorInterval} is not an integer from 0 to ${PRIOR_MAX}`;
  }

  if (o.mode !== null && !isIntIn(o.mode, MODE_PERMISSIVE, MODE_TIMEOUT_ONLY)) {
    return `the mode ${o.mode} is not one of 0, 1 and 2`;
  }

  if (!isTriState(o.chordal) || !isTriState(o.speculative) || !isTriState(o.retro)) {
    return "an on/off option is neither a boolean nor null";
  }

  return null;
};

/** Mirror the firmware's readPerKey. Return why the keyboard would reject `list`, or null when it accepts it. */
export const validatePerKeyOverrides = (list: PerKeyOverride[]): string | null => {
  if (list.length > MAX_PER_KEY) {
    return `more than ${MAX_PER_KEY} keys`;
  }

  const seen = new Set<number>();

  for (let i = 0; i < list.length; i += 1) {
    const invalid = validatePerKeyOverride(list[i]);

    if (invalid !== null) {
      return `key ${i}: ${invalid}`;
    }

    if (seen.has(list[i].position)) {
      return `key ${i}: repeats the position ${list[i].position}`;
    }

    seen.add(list[i].position);
  }

  return null;
};

const triStateToWire = (value: boolean | null): number => {
  if (value === null) {
    return GLOBAL_FIELD;
  }

  return value ? 1 : 0;
};

/** Serialize the overrides as the keyboard sends them, so a read-back compares equal. Leave out keys with no override. */
export const serializePerKeyOverrides = (list: PerKeyOverride[]): string => {
  const kept = list.filter(o => !isOverrideEmpty(o)).sort((a, b) => a.position - b.position);
  const values = [kept.length];

  kept.forEach(o => {
    values.push(
      o.position,
      o.holdTimeout ?? GLOBAL_U16,
      o.quickTapTerm ?? GLOBAL_U16,
      o.priorInterval ?? GLOBAL_U8,
      o.mode ?? GLOBAL_FIELD,
      triStateToWire(o.chordal),
      triStateToWire(o.speculative),
      triStateToWire(o.retro),
    );
  });

  return values.join(" ");
};

const triStateFromWire = (value: number): boolean | null => {
  if (value === GLOBAL_FIELD) {
    return null;
  }

  return value === 1;
};

/** Return the overrides in a `qukeys.perKey` reply or backup entry, sorted by position, or null when it is not a table the keyboard
 * accepts. Drop entries with no override, which the keyboard never sends. */
export const parsePerKeyOverrides = (raw: unknown): PerKeyOverride[] | null => {
  const values = parseDecimals(raw);

  if (values === null) {
    return null;
  }

  const count = values[0];

  if (count > MAX_PER_KEY || values.length !== 1 + PER_KEY_FIELDS * count) {
    return null;
  }

  const list: PerKeyOverride[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < count; i += 1) {
    const [position, holdTimeout, quickTapTerm, priorInterval, mode, chordal, speculative, retro] = values.slice(
      1 + PER_KEY_FIELDS * i,
      1 + PER_KEY_FIELDS * (i + 1),
    );

    /* The 2-bit on/off fields take 0, 1 and 3. 2 is invalid */
    if (
      priorInterval > GLOBAL_U8 ||
      mode > GLOBAL_FIELD ||
      [chordal, speculative, retro].some(v => v > GLOBAL_FIELD || v === 2)
    ) {
      return null;
    }

    const o: PerKeyOverride = {
      position,
      holdTimeout: holdTimeout === GLOBAL_U16 ? null : holdTimeout,
      quickTapTerm: quickTapTerm === GLOBAL_U16 ? null : quickTapTerm,
      priorInterval: priorInterval === GLOBAL_U8 ? null : priorInterval,
      mode: mode === GLOBAL_FIELD ? null : mode,
      chordal: triStateFromWire(chordal),
      speculative: triStateFromWire(speculative),
      retro: triStateFromWire(retro),
    };

    if (validatePerKeyOverride(o) !== null || seen.has(position)) {
      return null;
    }

    seen.add(position);

    if (!isOverrideEmpty(o)) {
      list.push(o);
    }
  }

  return list.sort((a, b) => a.position - b.position);
};

/** Return true when a restore must reset the global options, because the keyboard has them and the backup lacks them. */
export const needsDualFunctionClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(DUAL_FUNCTION_COMMAND) && !commands.includes(DUAL_FUNCTION_COMMAND);

/** Return true when a restore must clear the overrides, because the keyboard has them and the backup lacks them. */
export const needsPerKeyClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(PER_KEY_COMMAND) && !commands.includes(PER_KEY_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface DualFunctionDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

const readParsed = async <T>(
  device: DualFunctionDevice,
  command: string,
  parse: (raw: unknown) => T | null,
): Promise<T | null> => {
  try {
    return parse(await device.noCacheCommand(command));
  } catch (error) {
    return null;
  }
};

/* Write `sent` and read it back uncached. Throw unless the keyboard holds exactly what was sent */
const writeChecked = async <T>(
  device: DualFunctionDevice,
  command: string,
  sent: string,
  parse: (raw: unknown) => T | null,
  serialize: (value: T) => string,
  what: string,
): Promise<void> => {
  let stored: T | null;

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

    stored = parse(reply);
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
  if (stored === null || serialize(stored) !== sent) {
    throw new Error(`The keyboard did not store the ${what}`);
  }
};

/** Return the global options on the keyboard, or null when they cannot be read. */
export const readDualFunctionGlobals = (device: DualFunctionDevice): Promise<DualFunctionGlobals | null> =>
  readParsed(device, DUAL_FUNCTION_COMMAND, parseDualFunctionGlobals);

/** Return the overrides on the keyboard, or null when they cannot be read. */
export const readPerKeyOverrides = (device: DualFunctionDevice): Promise<PerKeyOverride[] | null> =>
  readParsed(device, PER_KEY_COMMAND, parsePerKeyOverrides);

/** Write the global options and read them back. Throw unless the keyboard holds exactly what was sent. */
export const writeDualFunctionGlobals = async (device: DualFunctionDevice, globals: DualFunctionGlobals): Promise<void> => {
  const invalid = validateDualFunctionGlobals(globals);

  if (invalid !== null) {
    throw new Error(`Dual-function options not sent: ${invalid}`);
  }

  await writeChecked(
    device,
    DUAL_FUNCTION_COMMAND,
    serializeDualFunctionGlobals(globals),
    parseDualFunctionGlobals,
    serializeDualFunctionGlobals,
    "dual-function options",
  );
};

/** Write the overrides, replacing the keyboard's table, and read them back. Throw unless the keyboard holds exactly what was sent. */
export const writePerKeyOverrides = async (device: DualFunctionDevice, list: PerKeyOverride[]): Promise<void> => {
  const invalid = validatePerKeyOverrides(list);

  if (invalid !== null) {
    throw new Error(`Per-key dual-function overrides not sent: ${invalid}`);
  }

  await writeChecked(
    device,
    PER_KEY_COMMAND,
    serializePerKeyOverrides(list),
    parsePerKeyOverrides,
    serializePerKeyOverrides,
    "per-key dual-function overrides",
  );
};

/** Restore a `qukeys.dualFunction` backup entry. Throw on a malformed entry without sending anything. */
export const restoreDualFunctionGlobals = async (device: DualFunctionDevice, data: string): Promise<void> => {
  const globals = parseDualFunctionGlobals(data);

  if (globals === null) {
    throw new Error(`Malformed ${DUAL_FUNCTION_COMMAND} backup entry`);
  }

  await writeDualFunctionGlobals(device, globals);
};

/** Restore a `qukeys.perKey` backup entry. Throw on a malformed entry without sending anything. */
export const restorePerKeyOverrides = async (device: DualFunctionDevice, data: string): Promise<void> => {
  const list = parsePerKeyOverrides(data);

  if (list === null) {
    throw new Error(`Malformed ${PER_KEY_COMMAND} backup entry`);
  }

  await writePerKeyOverrides(device, list);
};

/** Save the global options from Preferences, which comes last before the post-save backup. Write options that were read. Otherwise read
 * them again, so the Device cache holds the keyboard's options and not a failed reply, and throw when they still cannot be read. */
export const saveDualFunctionGlobals = async (device: DualFunctionDevice, globals: DualFunctionGlobals | null): Promise<void> => {
  if (globals !== null) {
    await writeDualFunctionGlobals(device, globals);
    return;
  }

  if ((await readDualFunctionGlobals(device)) === null) {
    throw new Error("Could not read the dual-function options");
  }
};
