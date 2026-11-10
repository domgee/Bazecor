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
import { compactActionLabel, compactActionText, modStyleFor, superkeySlotLabels } from "../../../lens/renderer/action-labels";
import type { LabelContext, ModStyle, SlotLabels } from "../../../lens/renderer/action-labels";
import { layoutOverrides, symbolOverrides } from "../../../lens/renderer/keycodes";
import { MAX_ACTIVE_SUPERKEYS, SUPERKEY_FIRST, isIdleSuperkey, normalizeActions } from "../../../api/parsers/superkeys";
import { decodeDualUse } from "../../../api/parsers/altRepeat";

/* Superkey names and key faces generated from the actions, so they follow every edit */

const SLOT_PREFIXES = ["T", "H", "TH", "2T", "2TH"];
const NAME_MAX = 24;
const FACE_MAX = 5;
const ELLIPSIS = "…";

const currentModStyle = (): ModStyle => modStyleFor(typeof navigator === "undefined" ? "" : navigator.userAgent);

/** A Lens label context for the Bazecor keyboard language. */
export const labelContext = (
  language: string,
  layerNames: string[] = [],
  macroNames: string[] = [],
  modStyle: ModStyle = currentModStyle(),
): LabelContext => ({
  overrides: layoutOverrides(language),
  symbols: symbolOverrides(language),
  layerNames,
  macroNames,
  superkeyNames: [],
  modStyle,
});

const cap = (text: string, max: number) => {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}${ELLIPSIS}`;
};

/** A name from the actions: "A/⌘" for a tap and a hold, otherwise each set action with its slot prefix. Empty for an idle Superkey. */
export const superkeyName = (actions: ReadonlyArray<number> | undefined, ctx: LabelContext): string => {
  if (isIdleSuperkey(actions)) {
    return "";
  }

  const texts = normalizeActions(actions).map(action => (action === 1 ? "" : compactActionText(action, ctx)));
  const [tap, hold, ...rest] = texts;

  if (tap && hold && rest.every(text => !text)) {
    return cap(`${tap}/${hold}`, NAME_MAX);
  }

  const parts = texts.reduce<string[]>((found, text, slot) => (text ? [...found, `${SLOT_PREFIXES[slot]}:${text}`] : found), []);
  return cap(parts.join(" "), NAME_MAX);
};

/** The key-face label: the tap text, or else the hold text, cut to five characters. `SK<n>` when the slot cannot be shown. */
export const superkeyFace = (actions: ReadonlyArray<number> | undefined, slot: number, ctx: LabelContext): string => {
  const fallback = `SK${slot + 1}`;

  if (slot >= MAX_ACTIVE_SUPERKEYS || actions === undefined || isIdleSuperkey(actions)) {
    return fallback;
  }

  const [tap, hold] = normalizeActions(actions);
  const text = tap !== 1 ? compactActionText(tap, ctx) : compactActionText(hold, ctx);
  return text ? [...text].slice(0, FACE_MAX).join("") : fallback;
};

/** The table as the store and old readers hold it, with generated names. */
export const withGeneratedNames = (table: ReadonlyArray<ReadonlyArray<number>>, ctx: LabelContext): SuperkeysType[] =>
  table.map((actions, id) => ({ actions: normalizeActions(actions), name: superkeyName(actions, ctx), id }));

/** The short text for one action, or its keycode when Lens has no label for it. */
export const actionText = (code: number, ctx: LabelContext): string => compactActionText(code, ctx) || String(code);

/** The actions a key face shows in the Layer Lens slots, or null for a plain key. A Superkey fills all five slots, a dual-function key
 * its tap and hold. A Superkey with no actions or beyond the limit keeps its plain label. */
export const keyFaceSlots = (
  keyCode: number,
  table: ReadonlyArray<{ actions: number[] } | undefined>,
  ctx: LabelContext,
): SlotLabels | null => {
  const slot = keyCode - SUPERKEY_FIRST;

  if (slot >= 0 && slot < MAX_ACTIVE_SUPERKEYS) {
    const actions = table[slot]?.actions;
    return actions === undefined ? null : superkeySlotLabels(normalizeActions(actions), ctx);
  }

  const dualUse = decodeDualUse(keyCode);

  if (dualUse === null) {
    return null;
  }

  return [compactActionLabel(dualUse.tap, ctx), compactActionLabel(dualUse.hold, ctx), null, null, null];
};
