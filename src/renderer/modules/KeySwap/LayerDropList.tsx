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

import React from "react";
import { createPortal } from "react-dom";
import { i18n } from "@Renderer/i18n";
import { WHEEL_EXEMPT_ATTR } from "@Renderer/modules/MultiAction/MultiActionTab";
import { SwapListAnchor } from "./keySwap";
import { KEY_SWAP_LAYER_ATTR } from "./swapDrag";

export interface LayerDropListItem {
  /* Firmware layer */
  id: number;
  /* The number the layer selector shows */
  number: number;
  name: string;
}

interface LayerDropListProps {
  layers: LayerDropListItem[];
  displayed: number;
  source: number;
  anchor: SwapListAnchor;
}

const ROW = "relative flex items-center gap-2 py-2 text-sm cursor-grabbing whitespace-nowrap";
const ROW_DISPLAYED =
  "bg-purple-200/10 text-purple-200 font-semibold dark:bg-gray-500 dark:text-gray-25 after:content-[''] after:absolute after:left-0 " +
  "after:top-1/2 after:translate-y-[-50%] after:h-[24px] after:w-[3px] after:rounded-tr-[3px] after:rounded-br-[3px] " +
  "after:bg-gradient-to-t after:from-secondary after:to-primary";

/** The layers a key can be dragged to, drawn over the page right of the keyboard. Hovering a row shows that layer. */
const LayerDropList = ({ layers, displayed, source, anchor }: LayerDropListProps) => {
  const { compact } = anchor;

  return createPortal(
    <div
      role="listbox"
      aria-label={i18n.editor.keySwap.title}
      {...{ [WHEEL_EXEMPT_ATTR]: "" }}
      className="fixed z-[1000] flex flex-col rounded-md shadow-md overflow-hidden bg-[#ffffff] text-gray-600 dark:bg-gray-600 dark:text-gray-50"
      style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxHeight: anchor.maxHeight }}
    >
      <div className={compact ? "px-1 py-2 text-[11px] leading-tight font-semibold text-center" : "px-3 py-2"}>
        <div className={compact ? "" : "text-sm font-semibold"}>{i18n.editor.keySwap.title}</div>
        {!compact && <div className="text-xs text-gray-400 dark:text-gray-200 whitespace-normal">{i18n.editor.keySwap.hint}</div>}
      </div>
      <div className="min-h-0 overflow-y-auto">
        {layers.map(layer => {
          const name = layer.name || i18n.general.noname;
          const isSource = layer.id === source;

          return (
            <div
              key={layer.id}
              role="option"
              aria-selected={layer.id === displayed}
              title={compact ? name : undefined}
              {...{ [KEY_SWAP_LAYER_ATTR]: layer.id }}
              className={`${ROW} ${compact ? "justify-center px-1" : "px-3"} ${layer.id === displayed ? ROW_DISPLAYED : ""}`}
            >
              <em className={`not-italic ${compact ? "" : "w-7 text-right"}`}>#{layer.number}.</em>
              {!compact && <span className="min-w-0 overflow-hidden text-ellipsis">{name}</span>}
              {isSource && compact && (
                <span aria-label={i18n.editor.keySwap.source} className="w-1.5 h-1.5 shrink-0 rounded-full bg-purple-200" />
              )}
              {isSource && !compact && (
                <span className="ml-auto shrink-0 rounded-sm px-1.5 text-[11px] bg-gray-100/40 dark:bg-gray-500">
                  {i18n.editor.keySwap.source}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
};

export default LayerDropList;
