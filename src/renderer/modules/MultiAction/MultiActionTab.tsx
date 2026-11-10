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

/* The Multi-action tab edits the five Superkey actions of one key, saved as a plain key, a dual-function key or a Superkey */

export type MultiActionStorage = "plain" | "dualUse" | "superkey";

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
}

interface MultiActionTabProps extends MultiActionProps {
  disabled?: boolean;
  /* The nested key picker for one action. It sends each picked keycode to onSelect */
  renderPicker: (slot: number, onSelect: (code: number) => void) => React.ReactNode;
}

const IDLE = 1;

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

  if (context !== "cell") {
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
  disabled = false,
  renderPicker,
}: MultiActionTabProps) => {
  const [openSlot, setOpenSlot] = useState<number | null>(null);
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
                <PopoverContent side="top" sideOffset={6} className="w-[min(960px,92vw)] max-w-full">
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
    </div>
  );
};

export default MultiActionTab;
