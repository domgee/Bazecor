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

/* The checks before a save removes unused Superkeys. Each save decides whether to collect before it prepares the table, so a save
 * that keeps the unused Superkeys never writes a collected table. */

/** Why a save keeps the unused Superkeys */
export type PruneSkipReason = "notReady" | "virtual" | "unreadable" | "tableUnknown";

/** True when every reference outside the draft is known, so a slot no reference uses is really unused */
export const gcInputsKnown = ({ combos, keymapKnown }: { combos: "ready" | "unsupported" | "failed"; keymapKnown: boolean }): boolean =>
  combos !== "failed" && keymapKnown;

/** Why the save must not collect, or null when it may. Decide this before prepareSuperkeyWrite. */
export const collectBlock = ({
  ready,
  isVirtual,
  readsOk,
  persistedTable,
}: {
  /* Superkeys, combos, rules and the keymap replies are all read */
  ready: boolean;
  isVirtual: boolean;
  /* The previews and superkeys.map read again just before the save */
  readsOk: boolean;
  persistedTable: number[][] | null;
}): PruneSkipReason | null => {
  if (!ready) {
    return "notReady";
  }

  if (isVirtual) {
    return "virtual";
  }

  if (!readsOk) {
    return "unreadable";
  }

  return persistedTable === null ? "tableUnknown" : null;
};
