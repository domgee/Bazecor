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

import { PreparedSuperkeyWrite, actionsKey, recoveryNeeded } from "../../../api/parsers/multiAction";
import { isIdleSuperkey } from "../../../api/parsers/superkeys";

/* The gate before the Layout editor removes unused Superkeys.
 *
 * The save decides whether to collect before it prepares the table. A slot the keyboard holds is only removed when a verified recovery
 * backup holds the same definition, and any failure on the way keeps every slot for that save.
 */

export type SuperkeyRemoval = { slot: number; actions: number[] };

/** Why a save keeps the unused Superkeys */
export type PreGcSkipReason = "notReady" | "virtual" | "previews" | "tableUnknown" | "backupFailed";

export type PreGcPlan = { action: "none" } | { action: "backup" } | { action: "skipGc"; reason: PreGcSkipReason };

/** A slot's definition in a verified recovery backup, and that backup's path */
export type RecoveryCoverage = Map<number, { key: string; path: string }>;

/** Why the save must not collect, or null when it may. Decide this before prepareSuperkeyWrite. */
export const collectBlock = ({
  ready,
  isVirtual,
  previewsOk,
  persistedTable,
}: {
  /* Superkeys, combos and rules are all read */
  ready: boolean;
  isVirtual: boolean;
  previewsOk: boolean;
  persistedTable: number[][] | null;
}): PreGcSkipReason | null => {
  if (!ready) {
    return "notReady";
  }

  if (isVirtual) {
    return "virtual";
  }

  if (!previewsOk) {
    return "previews";
  }

  return persistedTable === null ? "tableUnknown" : null;
};

/** What the save does before its first write */
export const planPreGc = ({
  collect,
  isVirtual,
  previewsOk,
  persistedTable,
  removals,
  covered,
}: {
  collect: boolean;
  isVirtual: boolean;
  previewsOk: boolean;
  persistedTable: number[][] | null;
  removals: SuperkeyRemoval[];
  covered: RecoveryCoverage;
}): PreGcPlan => {
  const blocked = collectBlock({ ready: collect, isVirtual, previewsOk, persistedTable });

  if (blocked !== null) {
    return { action: "skipGc", reason: blocked };
  }

  return recoveryNeeded(removals, coverageKeys(covered)) ? { action: "backup" } : { action: "none" };
};

export const coverageKeys = (covered: RecoveryCoverage): Map<number, string> =>
  new Map([...covered.entries()].map(([slot, { key }]) => [slot, key]));

/** The coverage after a verified recovery backup at `path` that holds `table` */
export const withRecoveryBackup = (covered: RecoveryCoverage, table: number[][], path: string): RecoveryCoverage => {
  const next: RecoveryCoverage = new Map(covered);

  table.forEach((actions, slot) => {
    if (!isIdleSuperkey(actions)) {
      next.set(slot, { key: actionsKey(actions), path });
    }
  });

  return next;
};

/** The recovery backups that hold the removed slots */
export const recoveryPaths = (removals: SuperkeyRemoval[], covered: RecoveryCoverage): string[] => {
  const paths = removals.flatMap(({ slot, actions }) => {
    const entry = covered.get(slot);
    return entry !== undefined && entry.key === actionsKey(actions) ? [entry.path] : [];
  });

  return [...new Set(paths)];
};

export interface PreGcIo {
  /* prepareSuperkeyWrite for the draft with this collect flag */
  prepare: (collect: boolean) => PreparedSuperkeyWrite;
  /* The slots the keyboard holds that the save with this prepared table removes */
  removals: (prepared: PreparedSuperkeyWrite) => SuperkeyRemoval[];
  /* Take, save and verify a recovery backup, giving its path and the Superkey table it holds */
  backup: () => Promise<{ path: string; table: number[][] }>;
}

export interface PreGcResult {
  prepared: PreparedSuperkeyWrite;
  collect: boolean;
  /* The slots the keyboard holds that this save removes when it succeeds */
  removals: SuperkeyRemoval[];
  covered: RecoveryCoverage;
  /* Set when the save keeps the unused Superkeys after it meant to collect */
  skipped?: PreGcSkipReason;
  error?: unknown;
}

/** Prepare the Superkey write, taking a recovery backup first when the save removes a slot no backup holds yet */
export const runPreGc = async (
  input: { collect: boolean; isVirtual: boolean; previewsOk: boolean; persistedTable: number[][] | null; covered: RecoveryCoverage },
  io: PreGcIo,
): Promise<PreGcResult> => {
  const { covered } = input;
  const blocked = input.collect ? collectBlock({ ready: true, ...input }) : "notReady";

  if (blocked !== null) {
    return { prepared: io.prepare(false), collect: false, removals: [], covered, skipped: input.collect ? blocked : undefined };
  }

  const prepared = io.prepare(true);

  /* Take no backup for a save the conflicts refuse anyway */
  if (prepared.conflicts.length > 0) {
    return { prepared, collect: true, removals: [], covered };
  }

  const removals = io.removals(prepared);
  const plan = planPreGc({ ...input, removals });

  if (plan.action === "none") {
    return { prepared, collect: true, removals, covered };
  }

  try {
    const { path, table } = await io.backup();
    const next = withRecoveryBackup(covered, table, path);

    /* Refuse a backup that holds other definitions than the ones the save removes */
    if (recoveryNeeded(removals, coverageKeys(next))) {
      return {
        prepared: io.prepare(false),
        collect: false,
        removals: [],
        covered: next,
        skipped: "backupFailed",
        error: new Error(`The recovery backup ${path} does not hold the Superkeys the save removes`),
      };
    }

    return { prepared, collect: true, removals, covered: next };
  } catch (error) {
    return { prepared: io.prepare(false), collect: false, removals: [], covered, skipped: "backupFailed", error };
  }
};
