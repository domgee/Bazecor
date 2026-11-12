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

/* Custom LED effect slots, LEDCustomDygma in the Sonsei firmware.
 *
 * The wire format of `led.custom` for read and write is the count, then count x `type r g b speed`. The count is the highest used slot
 * plus one, and unused slots below it are `0 0 0 0 0`. A write is all or nothing. A rejected write keeps the old table and replies `error`.
 * The virtual keyboard echoes the payload instead, so every write is read back. Key code 17155 + n turns slot n on, and pressing it again
 * while slot n is active returns to Layers.
 *
 * Keep this file free of renderer imports, since Layer Lens reads it too.
 */

export const LED_CUSTOM_COMMAND = "led.custom";
export const MAX_LED_SLOTS = 16;
export const LED_CUSTOM_FIRST = 17155;
export const LED_CUSTOM_LAST = LED_CUSTOM_FIRST + MAX_LED_SLOTS - 1;

export const LED_TYPE_UNUSED = 0;
export const LED_TYPE_SOLID = 1;
export const LED_TYPE_RAINBOW = 2;
export const LED_TYPE_WAVE = 3;
export const LED_TYPE_STALKER = 4;
export const LED_TYPE_LAYERS = 5;
export const LED_TYPE_OFF = 6;
export const LED_TYPE_MAX = LED_TYPE_OFF;

/* Rainbow speed is the step delay in ms. 0 means the built-in 40, and nothing faster than the built-in Rainbow is allowed */
export const RAINBOW_SPEED_MIN = 40;
export const RAINBOW_SPEED_MAX = 255;
export const RAINBOW_SPEED_DEFAULT = 40;

const FIELDS = 5;
const BYTE_MAX = 255;

/** One slot of `led.custom`. Type 0 is an unused slot. */
export interface LedCustomSlot {
  type: number;
  r: number;
  g: number;
  b: number;
  speed: number;
}

/** "ready": the table is loaded. "unsupported": the firmware lacks it. "failed": it could not be read. */
export type LedCustomState = "unsupported" | "ready" | "failed";

export const UNUSED_LED_SLOT: LedCustomSlot = { type: LED_TYPE_UNUSED, r: 0, g: 0, b: 0, speed: 0 };

/** The types the picker offers, in its order. */
export const LED_PICKER_TYPES = [LED_TYPE_SOLID, LED_TYPE_RAINBOW, LED_TYPE_WAVE, LED_TYPE_STALKER, LED_TYPE_LAYERS, LED_TYPE_OFF];

const TYPE_NAMES: Record<number, string> = {
  [LED_TYPE_SOLID]: "Solid",
  [LED_TYPE_RAINBOW]: "Rainbow",
  [LED_TYPE_WAVE]: "Wave",
  [LED_TYPE_STALKER]: "Stalker",
  [LED_TYPE_LAYERS]: "Layers",
  [LED_TYPE_OFF]: "Off",
};

/** The short name of a type for key faces, or null for an unused or unknown type. */
export const ledTypeName = (type: number): string | null => TYPE_NAMES[type] ?? null;

/** Does the firmware's `help` reply list the custom LED effects command? */
export const hasLedCustomCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === LED_CUSTOM_COMMAND);
};

/** The slot a key code turns on, or null when it is no slot key. */
export const ledSlotOf = (code: number): number | null => (code >= LED_CUSTOM_FIRST && code <= LED_CUSTOM_LAST ? code - LED_CUSTOM_FIRST : null);

export const ledSlotCode = (slot: number): number => LED_CUSTOM_FIRST + slot;

export const isLedSlotCode = (code: number): boolean => ledSlotOf(code) !== null;

/** A full table of unused slots. */
export const emptyLedTable = (): LedCustomSlot[] => Array.from({ length: MAX_LED_SLOTS }, () => ({ ...UNUSED_LED_SLOT }));

/** The slot with the fields its type does not use set to 0 and Rainbow's default speed spelled out, so equal settings compare equal. */
export const canonicalLedSlot = (slot: LedCustomSlot): LedCustomSlot => {
  if (slot.type === LED_TYPE_SOLID) {
    return { type: slot.type, r: slot.r, g: slot.g, b: slot.b, speed: 0 };
  }

  if (slot.type === LED_TYPE_RAINBOW) {
    return { type: slot.type, r: 0, g: 0, b: 0, speed: slot.speed === 0 ? RAINBOW_SPEED_DEFAULT : slot.speed };
  }

  return { ...UNUSED_LED_SLOT, type: slot.type };
};

export const sameLedSettings = (a: LedCustomSlot, b: LedCustomSlot): boolean => {
  const x = canonicalLedSlot(a);
  const y = canonicalLedSlot(b);
  return x.type === y.type && x.r === y.r && x.g === y.g && x.b === y.b && x.speed === y.speed;
};

/** The table in a `led.custom` reply, always 16 slots, or null when the reply is not one. */
export const parseLedCustomRaw = (raw: unknown): LedCustomSlot[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_LED_SLOTS || values.length !== 1 + FIELDS * count || values.some(v => v > BYTE_MAX)) {
    return null;
  }

  const table = emptyLedTable();

  for (let i = 0; i < count; i += 1) {
    const [type, r, g, b, speed] = values.slice(1 + FIELDS * i, 1 + FIELDS * (i + 1));

    if (type > LED_TYPE_MAX) {
      return null;
    }

    table[i] = { type, r, g, b, speed };
  }

  return table;
};

/** The canonical wire form. Trailing unused slots are left out, so the same table always serializes the same way. */
export const serializeLedCustom = (table: LedCustomSlot[]): string => {
  let count = 0;

  table.slice(0, MAX_LED_SLOTS).forEach((slot, index) => {
    if (slot.type !== LED_TYPE_UNUSED) {
      count = index + 1;
    }
  });

  const values = [count];

  table.slice(0, count).forEach(slot => {
    const canonical = canonicalLedSlot(slot);
    values.push(canonical.type, canonical.r, canonical.g, canonical.b, canonical.speed);
  });

  return values.join(" ");
};

const isByte = (value: number) => Number.isInteger(value) && value >= 0 && value <= BYTE_MAX;

/** Mirror of the firmware's slot check. Why it would reject `slot` in canonical form, or null when it accepts it. */
export const validateLedSlot = (slot: LedCustomSlot): string | null => {
  if (![slot.type, slot.r, slot.g, slot.b, slot.speed].every(isByte)) {
    return "a value is not a byte";
  }

  if (slot.type > LED_TYPE_MAX) {
    return `the type ${slot.type} is unknown`;
  }

  const canonical = canonicalLedSlot(slot);

  if (canonical.type === LED_TYPE_RAINBOW && (canonical.speed < RAINBOW_SPEED_MIN || canonical.speed > RAINBOW_SPEED_MAX)) {
    return `the Rainbow speed ${slot.speed} is outside ${RAINBOW_SPEED_MIN}..${RAINBOW_SPEED_MAX}`;
  }

  return null;
};

/** Why the firmware would reject `table`, or null when it accepts it. */
export const validateLedCustom = (table: LedCustomSlot[]): string | null => {
  if (table.length > MAX_LED_SLOTS && table.slice(MAX_LED_SLOTS).some(slot => slot.type !== LED_TYPE_UNUSED)) {
    return `more than ${MAX_LED_SLOTS} slots`;
  }

  for (let i = 0; i < Math.min(table.length, MAX_LED_SLOTS); i += 1) {
    const invalid = validateLedSlot(table[i]);

    if (invalid !== null) {
      return `slot ${i + 1}: ${invalid}`;
    }
  }

  return null;
};

/** True when a restore must clear the table, because the keyboard has it and the backup does not. */
export const needsLedCustomClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(LED_CUSTOM_COMMAND) && !commands.includes(LED_CUSTOM_COMMAND);

/* ------------------------------------------------------------------------ */
/* Editor allocation. Each returns a new table and leaves its input alone    */
/* ------------------------------------------------------------------------ */

/** Everything that can send a slot key: the keymap layers, default ones included, previous-key rule outputs and combo outputs. */
export interface LedRefSources {
  layers: number[][];
  rules?: ReadonlyArray<{ output: number }>;
  combos?: ReadonlyArray<{ action: number }>;
}

/** The slots the sources reference. */
export const ledSlotRefs = (sources: LedRefSources): Set<number> => {
  const refs = new Set<number>();
  const add = (code: number) => {
    const slot = ledSlotOf(code);

    if (slot !== null) {
      refs.add(slot);
    }
  };

  sources.layers.forEach(layer => layer.forEach(add));
  (sources.rules ?? []).forEach(rule => add(rule.output));
  (sources.combos ?? []).forEach(combo => add(combo.action));
  return refs;
};

/** The code for `settings` and the table it needs. Reuse a slot with the same settings, else take the lowest slot the draft does not use
 * and the keyboard may not play. Never change a slot in `used` or `protectedSlots`. */
export const encodeLedSlot = (
  settings: LedCustomSlot,
  table: LedCustomSlot[],
  used: Set<number>,
  protectedSlots: Set<number>,
): { code: number; table: LedCustomSlot[] } | { error: "capacity" } => {
  const wanted = canonicalLedSlot(settings);
  const reused = table.findIndex((slot, index) => index < MAX_LED_SLOTS && slot.type !== LED_TYPE_UNUSED && sameLedSettings(slot, wanted));

  if (reused >= 0) {
    return { code: ledSlotCode(reused), table };
  }

  for (let slot = 0; slot < MAX_LED_SLOTS; slot += 1) {
    if (!used.has(slot) && !protectedSlots.has(slot)) {
      const next = emptyLedTable().map((each, index) => table[index] ?? each);
      next[slot] = wanted;
      return { code: ledSlotCode(slot), table: next };
    }
  }

  return { error: "capacity" };
};

/** The table with every slot outside `keep` unused. Return `table` itself when it keeps them all. */
export const gcLedCustom = (table: LedCustomSlot[], keep: Set<number>): LedCustomSlot[] => {
  const drops = table.some((slot, index) => slot.type !== LED_TYPE_UNUSED && !keep.has(index));

  if (!drops) {
    return table;
  }

  return table.map((slot, index) => (keep.has(index) ? slot : { ...UNUSED_LED_SLOT }));
};

/** A slot's settings as a layer file carries them. */
export interface LedCustomFileEntry extends LedCustomSlot {
  slot: number;
}

/** The slots the codes of an exported layer use, sorted by slot. */
export const ledCustomExport = (table: LedCustomSlot[], codes: number[]): LedCustomFileEntry[] => {
  const used = ledSlotRefs({ layers: [codes] });

  return [...used]
    .sort((a, b) => a - b)
    .filter(slot => table[slot] !== undefined && table[slot].type !== LED_TYPE_UNUSED)
    .map(slot => ({ slot, ...canonicalLedSlot(table[slot]) }));
};

const fileEntryFor = (fileEntries: unknown, slot: number): LedCustomSlot | undefined => {
  if (!Array.isArray(fileEntries)) {
    return undefined;
  }

  const entry = fileEntries
    .map(raw => (raw ?? {}) as Partial<LedCustomFileEntry>)
    .find(each => each.slot === slot);

  if (entry === undefined) {
    return undefined;
  }

  const settings = { type: entry.type, r: entry.r, g: entry.g, b: entry.b, speed: entry.speed };

  if (!Object.values(settings).every(value => typeof value === "number")) {
    return undefined;
  }

  const valid = settings as LedCustomSlot;
  return valid.type !== LED_TYPE_UNUSED && validateLedSlot(valid) === null ? canonicalLedSlot(valid) : undefined;
};

/** Fit the slot keys of an import into `table`. Map each code to a slot with the file's settings. A code without valid settings in the file
 * or without room becomes 0, an empty key, and sets `emptied`. */
export const importLedCustom = (
  table: LedCustomSlot[],
  used: Set<number>,
  protectedSlots: Set<number>,
  importedCodes: number[],
  fileEntries: unknown,
): { table: LedCustomSlot[]; remap: Map<number, number>; emptied: boolean } => {
  const slots = [...ledSlotRefs({ layers: [importedCodes] })].sort((a, b) => a - b);
  /* Slots this import already gave a meaning count as used for the next one */
  const taken = new Set(used);
  const remap = new Map<number, number>();
  let next = table;
  let emptied = false;

  slots.forEach(slot => {
    const code = ledSlotCode(slot);
    const settings = fileEntryFor(fileEntries, slot);
    const encoded = settings === undefined ? null : encodeLedSlot(settings, next, taken, protectedSlots);

    if (encoded === null || "error" in encoded) {
      remap.set(code, 0);
      emptied = true;
      return;
    }

    next = encoded.table;
    taken.add(encoded.code - LED_CUSTOM_FIRST);
    remap.set(code, encoded.code);
  });

  return { table: next, remap, emptied };
};

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface LedCustomDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** The table on the keyboard, or null when it could not be read. */
export const readLedCustom = async (device: LedCustomDevice): Promise<LedCustomSlot[] | null> => {
  try {
    return parseLedCustomRaw(await device.noCacheCommand(LED_CUSTOM_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the table and read it back. Throw unless the keyboard holds exactly what was sent. */
export const writeLedCustom = async (device: LedCustomDevice, table: LedCustomSlot[]): Promise<void> => {
  const invalid = validateLedCustom(table);

  if (invalid !== null) {
    throw new Error(`LED effects not sent: ${invalid}`);
  }

  const sent = serializeLedCustom(table);
  let stored: LedCustomSlot[] | null;

  try {
    const written = await device.noCacheCommand(LED_CUSTOM_COMMAND, sent);

    if (written === undefined) {
      throw new Error(`The keyboard did not answer the ${LED_CUSTOM_COMMAND} write`);
    }

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the payload. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error("The keyboard rejected the LED effects");
    }

    const reply = await device.noCacheCommand(LED_CUSTOM_COMMAND);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = parseLedCustomRaw(reply);
  } catch (error) {
    /* Device caches the table it sent. Read what the keyboard holds, so a later backup does not record the unsent table */
    try {
      await device.noCacheCommand(LED_CUSTOM_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* The read-back already put the keyboard's table in the cache */
  if (stored === null || serializeLedCustom(stored) !== sent) {
    throw new Error("The keyboard did not store the LED effects");
  }
};

/** Restore a `led.custom` backup entry. */
export const restoreLedCustom = async (device: LedCustomDevice, data: string): Promise<void> => {
  const table = parseLedCustomRaw(data);

  if (table === null) {
    throw new Error(`Malformed ${LED_CUSTOM_COMMAND} backup entry`);
  }

  await writeLedCustom(device, table);
};
