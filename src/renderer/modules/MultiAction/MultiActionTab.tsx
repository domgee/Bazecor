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

import React, { useState } from "react";
import { i18n } from "@Renderer/i18n";
import {
  IconClose,
  IconKeys2Tap,
  IconKeys2TapHold,
  IconKeysHold,
  IconKeysPress,
  IconKeysTapHold,
  IconPlus,
} from "@Renderer/components/atoms/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@Renderer/components/atoms/Popover";
import MacrosMemoryUsage from "@Renderer/modules/Macros/MacrosMemoryUsage";
import OverridePanel from "@Renderer/modules/DualFunctionKeys/OverridePanel";
import { KeyRole, OverridePatch } from "@Renderer/modules/DualFunctionKeys/overrideTable";
import { DualFunctionGlobalPreview } from "@Renderer/types/dualFunctionKeys";
import { KeyType } from "@Renderer/types/layout";
import { PerKeyOverride, isOverrideEmpty } from "../../../api/parsers/dualFunction";

/* The Multi-action tab edits the five Superkey actions of one key, saved as a plain key, a dual-function key or a Superkey */

export type MultiActionStorage = "plain" | "dualUse" | "superkey";

/** The dual-function options of the selected physical key, which apply on every layer. */
export interface MultiActionPerKey {
  override: PerKeyOverride;
  /* The override as the keyboard holds it, which fixes the slider bounds */
  stored: PerKeyOverride;
  keyData: KeyType | undefined;
  role: KeyRole;
  globals: DualFunctionGlobalPreview;
  /* Makes the options read-only, with the reason shown when given */
  disabled: boolean;
  disabledReason?: string;
  onChange: (patch: OverridePatch) => void;
  onClear: () => void;
}

/** True when the key position has options of its own. */
export const hasCustomTiming = (perKey: MultiActionPerKey | undefined): boolean =>
  perKey !== undefined && !isOverrideEmpty(perKey.override);

export interface MultiActionProps {
  /* "dualUseOnly" on keyboards without Superkeys, where only Tap and Hold exist */
  mode: "full" | "dualUseOnly";
  context: "cell" | "combo" | "rule";
  /* Five actions, with 1 for an idle action */
  actions: number[];
  storage: MultiActionStorage;
  /* The Superkey slot the key uses, or null */
  slot: number | null;
  /* Every key, combo and tab that uses the Superkey, by name */
  users: string[];
  capacity: { used: number; max: number };
  /* Makes the tab read-only and says why */
  disabledReason?: string;
  notice?: string;
  actionLabel?: (code: number) => string;
  onChange: (actions: number[]) => void;
  /* Only for cells and previous-key tabs on keyboards with per-key dual-function options */
  perKey?: MultiActionPerKey;
}

interface MultiActionTabProps extends MultiActionProps {
  disabled?: boolean;
  /* The nested key picker for one action. It sends each picked keycode to onSelect */
  renderPicker: (slot: number, onSelect: (code: number) => void) => React.ReactNode;
}

const IDLE = 1;

/* Marks the open action picker, so wheel events inside it never switch the outer picker's tab */
export const MULTI_ACTION_POPOVER_ATTR = "data-multiaction-popover";

/* Marks an overlay whose wheel events never switch the picker's tab */
export const WHEEL_EXEMPT_ATTR = "data-wheel-exempt";

/** False for wheel events the outer picker must ignore, which come from a select list or arrive while an action picker is open. */
export const wheelSwitchesTab = (target: Element | null, doc: Document): boolean => {
  /* Keep the old check for a select list, whose own markup holds its options */
  if (target?.outerHTML?.includes('<div role="option"') || target?.closest?.('[role="option"]')) {
    return false;
  }

  if (target?.closest?.(`[${WHEEL_EXEMPT_ATTR}]`)) {
    return false;
  }

  return doc.querySelector(`[${MULTI_ACTION_POPOVER_ATTR}]`) === null;
};

const TILES = [
  { id: 0, icon: <IconKeysPress />, title: () => i18n.editor.superkeys.actions.tapLabel },
  { id: 1, icon: <IconKeysHold />, title: () => i18n.editor.superkeys.actions.holdLabel },
  { id: 2, icon: <IconKeysTapHold />, title: () => i18n.editor.superkeys.actions.tapAndHoldLabel },
  { id: 3, icon: <IconKeys2Tap />, title: () => i18n.editor.superkeys.actions.doubleTapLabel },
  { id: 4, icon: <IconKeys2TapHold />, title: () => i18n.editor.superkeys.actions.doubleTapAndHoldLabel },
];

const fill = (text: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((out, [key, value]) => out.split(`{${key}}`).join(String(value)), text);

/** The status line for how the key is saved. Empty when nothing is set. */
export const multiActionStatus = (
  props: Pick<MultiActionProps, "context" | "storage" | "slot" | "capacity" | "actions">,
): string => {
  const { context, storage, slot, capacity, actions } = props;
  const superkeyText = slot === null ? "" : fill(i18n.editor.multiAction.statusSuperkey, { slot: slot + 1, max: capacity.max });

  /* A tap-only combo result or previous-key tab is stored as a plain key */
  if (context !== "cell" && storage !== "plain") {
    return [i18n.editor.multiAction.statusAlwaysSuperkey, superkeyText].filter(Boolean).join(" ");
  }

  if (storage === "dualUse") {
    return i18n.editor.multiAction.statusDualUse;
  }

  if (storage === "superkey") {
    return superkeyText;
  }

  return actions[0] !== IDLE ? i18n.editor.multiAction.statusPlain : "";
};

const MultiActionTab = ({
  mode,
  context,
  actions,
  storage,
  slot,
  users,
  capacity,
  disabledReason,
  notice,
  actionLabel = code => String(code),
  onChange,
  perKey,
  disabled = false,
  renderPicker,
}: MultiActionTabProps) => {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [timingOpen, setTimingOpen] = useState(false);
  const customTiming = hasCustomTiming(perKey);
  const readOnly = disabled || disabledReason !== undefined;
  const tiles = mode === "dualUseOnly" ? TILES.slice(0, 2) : TILES;
  const onlyTap = actions.slice(1).every(action => action === IDLE);
  const status = multiActionStatus({ context, storage, slot, capacity, actions });

  const select = (index: number, code: number) => {
    const next = actions.map((action, i) => (i === index ? code : action));
    onChange(next);
  };

  return (
    <div className={`multiActionTab flex flex-col gap-3 ${readOnly ? "opacity-80" : ""}`}>
      {disabledReason !== undefined && (
        <p role="alert" className="text-ssm font-semibold text-red-200 dark:text-red-100">
          {disabledReason}
        </p>
      )}
      {notice !== undefined && (
        <p className="multiActionNotice text-ssm font-semibold text-purple-200 dark:text-purple-100">{notice}</p>
      )}
      <div className={`grid gap-1 ${mode === "dualUseOnly" ? "grid-cols-2 max-w-md" : "grid-cols-5"}`}>
        {tiles.map(tile => {
          const action = actions[tile.id] ?? IDLE;
          const title = tile.title();
          const isSet = action !== IDLE;
          const label = isSet ? actionLabel(action) : i18n.editor.multiAction.empty;

          return (
            <div
              key={`multiAction-${tile.id}`}
              data-testid={`multiAction-tile-${tile.id}`}
              className="relative flex flex-col gap-2 rounded-regular p-3 bg-white/60 dark:bg-gray-700/40"
            >
              <div className="flex items-center gap-2 text-ssm font-semibold text-gray-500 dark:text-gray-50 [&_svg]:w-5">
                {tile.icon}
                {title}
              </div>
              <Popover open={openSlot === tile.id} onOpenChange={open => setOpenSlot(open ? tile.id : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-label={`${title}: ${label}`}
                    className={`flex items-center justify-center gap-1 h-12 rounded border text-ssm font-semibold ${
                      isSet
                        ? "border-purple-200 bg-purple-200/10 text-gray-600 dark:text-gray-25"
                        : "border-dashed border-gray-200 text-gray-300 dark:border-gray-500"
                    } disabled:pointer-events-none`}
                  >
                    {label}
                    {!isSet && <IconPlus size="xs" />}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  sideOffset={6}
                  className="w-[min(960px,92vw)] max-w-full"
                  {...{ [MULTI_ACTION_POPOVER_ATTR]: "" }}
                >
                  {openSlot === tile.id && renderPicker(tile.id, code => select(tile.id, code))}
                </PopoverContent>
              </Popover>
              {isSet && !readOnly && (
                <button
                  type="button"
                  aria-label={`${i18n.editor.multiAction.clear} ${title}`}
                  className="absolute top-2 right-2 w-5 h-5 rounded text-gray-300 hover:text-purple-200 [&_svg]:w-4"
                  onClick={() => select(tile.id, IDLE)}
                >
                  <IconClose />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {status !== "" && <p className="multiActionStatus text-ssm font-medium text-gray-400 dark:text-gray-200">{status}</p>}
      {users.length > 1 && (
        <p className="multiActionShared inline-flex self-start rounded-full px-3 py-1 text-ssm bg-purple-200/10 text-purple-300 dark:text-purple-100">
          {fill(i18n.editor.multiAction.shared, { count: users.length, names: users.join(", ") })}
        </p>
      )}
      {mode === "dualUseOnly" ? (
        <p className="text-ssm text-gray-400 dark:text-gray-200">{i18n.editor.multiAction.dualUseOnlyHint}</p>
      ) : (
        onlyTap &&
        context === "cell" && (
          <p className="multiActionHint text-ssm text-gray-400 dark:text-gray-200">{i18n.editor.multiAction.emptyHint}</p>
        )
      )}
      {mode === "full" && (
        <div className="flex">
          <MacrosMemoryUsage context="superkeys" mem={capacity.used} tMem={capacity.max} warningOffset={0} />
        </div>
      )}
      {perKey !== undefined && context !== "combo" && (
        <div className="multiActionTiming flex flex-col gap-2 border-t border-gray-100 dark:border-gray-600 pt-3">
          <button
            type="button"
            aria-expanded={timingOpen}
            className="flex items-center gap-2 self-start text-ssm font-semibold text-gray-500 dark:text-gray-50"
            onClick={() => setTimingOpen(open => !open)}
          >
            <span aria-hidden>{timingOpen ? "\u25BE" : "\u25B8"}</span>
            {i18n.editor.multiAction.timingTitle}
            {customTiming && (
              <span className="multiActionCustomTiming rounded-full px-2 py-0.5 text-[10px] bg-orange-200/15 text-orange-200">
                {i18n.editor.multiAction.customTiming}
              </span>
            )}
          </button>
          {timingOpen && (
            <>
              <p className="text-ssm text-gray-400 dark:text-gray-200">{i18n.editor.multiAction.timingNote}</p>
              {context === "rule" && (
                <p className="text-ssm text-gray-400 dark:text-gray-200">{i18n.editor.multiAction.timingRuleNote}</p>
              )}
              {perKey.disabledReason !== undefined && (
                <p role="alert" className="text-ssm font-semibold text-red-200 dark:text-red-100">
                  {perKey.disabledReason}
                </p>
              )}
              <OverridePanel
                override={perKey.override}
                stored={perKey.stored}
                keyData={perKey.keyData}
                role={perKey.role}
                globals={perKey.globals}
                disabled={disabled || perKey.disabled || perKey.disabledReason !== undefined}
                onChange={perKey.onChange}
                onClear={perKey.onClear}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiActionTab;
