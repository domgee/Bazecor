import log from "electron-log/renderer";
import { SuperkeysType } from "@Renderer/types/superkeys";
import { writeUncached } from "./holdMods";

/* `superkeys.map` in the Sonsei firmware (KeyRoleManager.cpp).
 *
 * The keyboard stores SUPERKEY_ROWS rows of ROW_WORDS words. A write stores the words in order and leaves the rest as they were.
 * The firmware counts every row up to the first all-ERASED row as active, at most MAX_ACTIVE_SUPERKEYS of them.
 * A row is five actions and a 0. An idle action is 1.
 */

export const SUPERKEYS_COMMAND = "superkeys.map";
export const SUPERKEY_FIRST = 53980;
export const SUPERKEY_CODES = 128;
export const SUPERKEY_ROWS = 129;
export const ROW_WORDS = 6;
export const MAX_ACTIVE_SUPERKEYS = 70;
export const IDLE_ACTIONS = [1, 1, 1, 1, 1];
export const ERASED = 65535;

const ACTIONS_PER_ROW = 5;
const ROW_END = 0;
const LEGACY_EMPTY_WORDS = 512;

export type SuperkeyWriteFormat = "padded" | "legacy";

export interface ParsedSuperkeys {
  /** Rows 0..69, the ones the firmware can run */
  table: number[][];
  /** Rows at or above 70 by slot, kept for display only */
  beyond: Map<number, number[]>;
  /** The firmware's active row count when the reply has the fixed-row shape, otherwise null */
  storedRows: number | null;
}

export interface SuperkeysDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

const isIdleAction = (action: number | undefined | null) => action === undefined || action === null || action === 0 || action === 1;

/** Five actions with 0, null and missing actions as the firmware's idle 1. */
export const normalizeActions = (actions: ReadonlyArray<number | undefined | null> | undefined): number[] =>
  Array.from({ length: ACTIONS_PER_ROW }, (_, i) => {
    const action = actions?.[i];
    return isIdleAction(action) ? 1 : (action as number);
  });

/** True when every action of a Superkey is idle. 65535 is not idle. */
export const isIdleSuperkey = (actions: ReadonlyArray<number | undefined | null> | undefined): boolean =>
  normalizeActions(actions).every(action => action === 1);

export const isSuperkeyCode = (code: number): boolean => code >= SUPERKEY_FIRST && code < SUPERKEY_FIRST + SUPERKEY_CODES;

const isErasedRow = (row: number[]) => row.every(word => word === ERASED);

const splitTable = (rows: number[][], storedRows: number | null): ParsedSuperkeys | null => {
  if (rows.length > SUPERKEY_CODES) {
    return null;
  }

  const beyond = new Map<number, number[]>();

  rows.slice(MAX_ACTIVE_SUPERKEYS).forEach((row, i) => {
    beyond.set(MAX_ACTIVE_SUPERKEYS + i, row);
  });

  return { table: rows.slice(0, MAX_ACTIVE_SUPERKEYS), beyond, storedRows };
};

/* The fixed-row reply, or undefined when a row before the end does not end in 0 */
const parseFixedRows = (values: number[]): ParsedSuperkeys | null | undefined => {
  const rows: number[][] = [];
  const count = values.length / ROW_WORDS;
  let storedRows: number | null = null;

  for (let r = 0; r < count; r += 1) {
    const row = values.slice(r * ROW_WORDS, (r + 1) * ROW_WORDS);

    if (isErasedRow(row)) {
      storedRows = r;
      break;
    }

    /* Skip a row that the old serializer's trailing 0 started. It still counts as active up to the first erased row */
    if (row[0] === ROW_END) {
      for (let s = r + 1; s < count && storedRows === null; s += 1) {
        if (isErasedRow(values.slice(s * ROW_WORDS, (s + 1) * ROW_WORDS))) {
          storedRows = s;
        }
      }

      break;
    }

    if (row[ROW_WORDS - 1] !== ROW_END) {
      return undefined;
    }

    rows.push(normalizeActions(row.slice(0, ACTIONS_PER_ROW)));
  }

  return splitTable(rows, storedRows ?? count);
};

/* The old shape. Split on 0 and stop at a second 0 or at a row that starts with 65535 */
const parseSeparated = (values: number[]): ParsedSuperkeys | null => {
  const rows: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];

    if (value === ROW_END) {
      if (current.length === 0) {
        break;
      }

      rows.push(normalizeActions(current));
      current = [];
    } else if (value === ERASED && current.length === 0) {
      break;
    } else {
      current.push(value);

      if (current.length > ACTIONS_PER_ROW) {
        return null;
      }
    }
  }

  if (current.length > 0) {
    rows.push(normalizeActions(current));
  }

  return splitTable(rows, null);
};

/** The Superkeys in a `superkeys.map` reply, or null when the reply is not one. */
export const parseSuperkeysTable = (raw: unknown): ParsedSuperkeys | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));

  if (values.some(value => value > ERASED)) {
    return null;
  }

  const lastRow = values.slice(-ROW_WORDS);
  const fixedShape =
    values.length === SUPERKEY_ROWS * ROW_WORDS ||
    (values.length > 0 && values.length % ROW_WORDS === 0 && values.length <= SUPERKEY_ROWS * ROW_WORDS && isErasedRow(lastRow));

  if (fixedShape) {
    const fixed = parseFixedRows(values);

    if (fixed !== undefined) {
      return fixed;
    }
  }

  return parseSeparated(values);
};

/** The Superkeys as the old editors hold them, with names by index. Empty when the reply is not a Superkey table. */
export const parseSuperkeysRaw = (raw: string, stored: SuperkeysType[]): SuperkeysType[] => {
  const parsed = parseSuperkeysTable(raw);

  if (parsed === null) {
    log.warn("Discarded Superkeys, the reply is not a Superkey table", raw);
    return [];
  }

  /* Keep the rows at or above 70 for the old editors, so their indexes stay the same */
  const rows = parsed.table.concat([...parsed.beyond.values()]);

  return rows.map((actions, id) => ({ actions, name: stored.length > id ? (stored[id]?.name ?? "") : "", id }));
};

/** The write shape for a product. Only the Sonsei firmware is verified for the padded shape. */
export const superkeyWriteFormat = (product: string | undefined): SuperkeyWriteFormat => (product === "Sonsei" ? "padded" : "legacy");

/** Superkeys need a beta firmware on the first Raise, and nothing on other keyboards. */
export const superkeysAvailable = (product: string | undefined, version: string | undefined): boolean =>
  product !== "Raise" || (version ?? "").split(" ")[0].includes("beta");

/* Read-only command the Sonsei firmware lists in `help` when tap+hold Superkeys keep their own code instead of a shared qukey code */
export const UNIQUE_SUPERKEYS_COMMAND = "superkeys.unique";

export type UniqueSuperkeysMode = "unique" | "legacy" | "unknown";

/** Does the firmware's `help` reply list the unique Superkeys command? */
export const hasUniqueSuperkeysMarker = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === UNIQUE_SUPERKEYS_COMMAND);
};

/** The value for `capabilities.uniqueSuperkeys`, "unknown" when the `help` read failed, since `noCacheCommand` returns errors instead of throwing. */
export const uniqueSuperkeysFromHelp = (help: unknown): boolean | "unknown" => {
  if (typeof help !== "string" || help.trim().length === 0) {
    return "unknown";
  }

  return hasUniqueSuperkeysMarker(help);
};

/**
 * The Superkey mode from the stored `capabilities.uniqueSuperkeys`.
 * Only a boolean comes from a successful `help` read, so anything else is "unknown".
 */
export const uniqueSuperkeysMode = (stored: unknown): UniqueSuperkeysMode => {
  if (stored === true) {
    return "unique";
  }

  if (stored === false) {
    return "legacy";
  }

  return "unknown";
};

const serializeLegacyRows = (table: ReadonlyArray<ReadonlyArray<number>>): string => {
  if (table.length === 0) {
    return Array(LEGACY_EMPTY_WORDS).fill(ERASED).join(" ");
  }

  return table
    .flatMap(row => [...normalizeActions(row), ROW_END])
    .concat([ROW_END])
    .join(" ");
};

/** `table` as `superkeys.map` data. Padded rows end in erased rows that cover `storedRows`, or all rows when it is unknown. */
export const serializeSuperkeyTable = (
  table: ReadonlyArray<ReadonlyArray<number>>,
  format: SuperkeyWriteFormat,
  storedRows: number | null,
): string => {
  if (table.length > MAX_ACTIVE_SUPERKEYS) {
    throw new Error(`A Superkey table holds at most ${MAX_ACTIVE_SUPERKEYS} rows, got ${table.length}`);
  }

  if (format === "legacy") {
    return serializeLegacyRows(table);
  }

  const padRows = Math.min(SUPERKEY_ROWS, Math.max(storedRows ?? SUPERKEY_ROWS, table.length) + 1);
  const words = table.flatMap(row => [...normalizeActions(row), ROW_END]);

  for (let r = table.length; r < padRows; r += 1) {
    words.push(...Array<number>(ROW_WORDS).fill(ERASED));
  }

  return words.join(" ");
};

/** The old editors' write. Kept for MacroEditor. */
export const serializeSuperkeys = (superkeys: SuperkeysType[]) => {
  if (
    superkeys.length === 0 ||
    (superkeys.length === 1 && superkeys[0].actions.length === 0) ||
    (superkeys.length === 1 && superkeys[0].actions.length === 1 && superkeys[0].actions[0] === 0)
  ) {
    return Array(LEGACY_EMPTY_WORDS).fill("65535").join(" ");
  }

  return serializeLegacyRows(superkeys.map(superkey => superkey.actions));
};

const sameTable = (a: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<ReadonlyArray<number>>) =>
  a.length === b.length && a.every((row, i) => normalizeActions(row).join(" ") === normalizeActions(b[i]).join(" "));

/** Write the table and read it back. Throw unless the keyboard holds what was sent. Return the new stored row count. */
export const writeSuperkeyTable = async (
  device: SuperkeysDevice,
  table: ReadonlyArray<ReadonlyArray<number>>,
  format: SuperkeyWriteFormat,
  storedRows: number | null,
): Promise<number | null> => {
  await writeUncached(device, SUPERKEYS_COMMAND, serializeSuperkeyTable(table, format, storedRows));
  const reply = await device.noCacheCommand(SUPERKEYS_COMMAND);

  if (reply instanceof Error) {
    throw reply;
  }

  const stored = parseSuperkeysTable(reply);

  if (stored === null || !sameTable(stored.table, table)) {
    throw new Error("The keyboard did not store the Superkeys");
  }

  /* Stale rows behind the table stay active until the first erased row, so a padded write must end exactly at the table */
  if (format === "padded" && stored.storedRows !== table.length) {
    throw new Error("The keyboard kept stale Superkeys behind the written table");
  }

  return format === "padded" ? table.length : stored.storedRows;
};

/** Backup data for `superkeys.map` in the target keyboard's shape. Data that is not a Superkey table is returned unchanged. */
export const fitSuperkeysForTarget = (data: string, targetProduct: string | undefined): string => {
  const parsed = parseSuperkeysTable(data);

  if (parsed === null) {
    return data;
  }

  return serializeSuperkeyTable(parsed.table, superkeyWriteFormat(targetProduct), null);
};

/** Where `capabilities.uniqueSuperkeys` lives, so the save-time read works with the app store and in tests. */
export interface UniqueSuperkeysStore {
  get(): unknown;
  set(value: boolean): void;
}

/**
 * The Superkey mode for a write. Read `help` again when the stored mode is unknown, and store a successful result.
 * Returns "unknown" only when that read also fails.
 */
export const resolveSuperkeyModeForSave = async (device: SuperkeysDevice, stored: UniqueSuperkeysStore): Promise<UniqueSuperkeysMode> => {
  const mode = uniqueSuperkeysMode(stored.get());

  if (mode !== "unknown") {
    return mode;
  }

  let help: unknown;

  try {
    help = await device.noCacheCommand("help");
  } catch (error) {
    log.warn("[Superkeys] help could not be read for the Superkey mode", error);
    return "unknown";
  }

  const detected = uniqueSuperkeysFromHelp(help);

  if (detected === "unknown") {
    return "unknown";
  }

  stored.set(detected);
  log.info(`[Capabilities] uniqueSuperkeys -> ${detected} (read again before a save)`);
  return detected ? "unique" : "legacy";
};
