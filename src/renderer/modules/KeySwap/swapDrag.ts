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

import React, { RefObject, useEffect, useRef, useState } from "react";
import { KEY_SWAP_ROOT_CLASS } from "./keySwap";

/* Move this far before a press becomes a drag, so a plain click still selects the key */
export const DRAG_THRESHOLD_PX = 5;
export const KEY_SWAP_LAYER_ATTR = "data-key-swap-layer";

export interface SwapCellTarget {
  kind: "cell";
  layer: number;
  position: number;
  ledIndex: number;
}

export type SwapTarget = SwapCellTarget | { kind: "layer"; layer: number } | null;

/** The key a `.keyItem` element draws, or null when its attributes are not numbers. */
export const cellOfKey = (key: Element): SwapCellTarget | null => {
  const layer = parseInt(key.getAttribute("data-layer") ?? "", 10);
  const position = parseInt(key.getAttribute("data-key-index") ?? "", 10);
  const ledIndex = parseInt(key.getAttribute("data-led-index") ?? "", 10);

  if (Number.isNaN(layer) || Number.isNaN(position) || Number.isNaN(ledIndex)) {
    return null;
  }

  return { kind: "cell", layer, position, ledIndex };
};

/** The layer row or the key of `area` under the point, or null. */
export const swapTargetAt = (doc: Document, area: Element | null, x: number, y: number): SwapTarget => {
  const element = doc.elementFromPoint?.(x, y) ?? null;

  if (element === null) {
    return null;
  }

  const row = element.closest(`[${KEY_SWAP_LAYER_ATTR}]`);

  if (row !== null) {
    const layer = parseInt(row.getAttribute(KEY_SWAP_LAYER_ATTR) ?? "", 10);
    return Number.isNaN(layer) ? null : { kind: "layer", layer };
  }

  const key = element.closest(".keyItem");

  if (key === null || area === null || !area.contains(key)) {
    return null;
  }

  return cellOfKey(key);
};

export interface SwapPoint {
  x: number;
  y: number;
  pointerId: number;
  buttons: number;
}

export interface SwapDragDeps {
  targetAt: (x: number, y: number) => SwapTarget;
  /* False refuses the drag */
  begin: (source: SwapCellTarget) => boolean;
  hoverLayer: (layer: number) => void;
  hoverCell: (cell: SwapCellTarget | null) => void;
  drop: (cell: SwapCellTarget) => void;
  cancel: () => void;
}

export interface SwapDrag {
  down: (point: SwapPoint, source: SwapCellTarget) => void;
  move: (point: SwapPoint) => "started" | undefined;
  up: (point: SwapPoint) => void;
  cancel: () => void;
  reset: () => void;
  /* True once after a drag, so the click that ends it does not select a key */
  consumeClick: () => boolean;
  /* Drop a suppression no click used, as after a drag that ended outside the area */
  clearClick: () => void;
  isDragging: () => boolean;
  isActive: () => boolean;
}

const sameTarget = (a: SwapCellTarget | null, b: SwapCellTarget | null) =>
  a === b || (a !== null && b !== null && a.layer === b.layer && a.position === b.position);

/** The drag gesture without the DOM. A press stays pending until it moves past the threshold, then drags until release or cancel. */
export const createSwapDrag = (deps: SwapDragDeps): SwapDrag => {
  let phase: "idle" | "pending" | "dragging" = "idle";
  let start: { x: number; y: number; pointerId: number; source: SwapCellTarget } | null = null;
  let lastLayer = -1;
  let lastCell: SwapCellTarget | null = null;
  let suppressClick = false;

  const idle = () => {
    phase = "idle";
    start = null;
    lastCell = null;
  };

  const cancel = () => {
    if (phase === "dragging") {
      idle();
      suppressClick = true;
      deps.cancel();
    } else if (phase === "pending") {
      idle();
    }
  };

  const up = (point: SwapPoint) => {
    if (start === null || point.pointerId !== start.pointerId) {
      return;
    }

    if (phase === "pending") {
      idle();
      return;
    }

    const target = deps.targetAt(point.x, point.y);
    idle();
    suppressClick = true;

    if (target?.kind === "cell") {
      deps.drop(target);
    } else {
      deps.cancel();
    }
  };

  const move = (point: SwapPoint): "started" | undefined => {
    if (start === null || point.pointerId !== start.pointerId) {
      return undefined;
    }

    /* Treat a move without a pressed button as the release that never arrived */
    if (point.buttons === 0) {
      if (phase === "pending") {
        up(point);
      } else {
        cancel();
      }

      return undefined;
    }

    if (phase === "pending") {
      const dx = point.x - start.x;
      const dy = point.y - start.y;

      if (dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
        return undefined;
      }

      if (!deps.begin(start.source)) {
        idle();
        return undefined;
      }

      phase = "dragging";
      lastLayer = start.source.layer;
      lastCell = null;
      return "started";
    }

    const target = deps.targetAt(point.x, point.y);

    if (target?.kind === "layer" && target.layer !== lastLayer) {
      lastLayer = target.layer;
      deps.hoverLayer(target.layer);
    }

    const cell = target?.kind === "cell" ? target : null;

    if (!sameTarget(cell, lastCell)) {
      lastCell = cell;
      deps.hoverCell(cell);
    }

    return undefined;
  };

  return {
    down: (point, source) => {
      suppressClick = false;
      phase = "pending";
      start = { x: point.x, y: point.y, pointerId: point.pointerId, source };
      lastCell = null;
    },
    move,
    up,
    cancel,
    reset: () => {
      idle();
      suppressClick = false;
    },
    consumeClick: () => {
      const consumed = suppressClick;
      suppressClick = false;
      return consumed;
    },
    clearClick: () => {
      suppressClick = false;
    },
    isDragging: () => phase === "dragging",
    isActive: () => phase !== "idle",
  };
};

export interface KeySwapDragOptions {
  enabled: boolean;
  /* The element that holds the keyboard. It takes the pointer capture, so it must stay mounted while the layer changes */
  areaRef: RefObject<HTMLElement>;
  onBegin: (source: SwapCellTarget) => boolean;
  onHoverLayer: (layer: number) => void;
  onHoverCell: (cell: SwapCellTarget | null) => void;
  onDrop: (cell: SwapCellTarget) => void;
  onCancel: () => void;
}

export interface KeySwapDragHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onClickCapture: (event: React.MouseEvent) => void;
  isActive: () => boolean;
  cancel: () => void;
}

interface KeySwapDragController {
  handlers: KeySwapDragHandlers;
  dispose: () => void;
}

const pointOf = (event: PointerEvent): SwapPoint => ({
  x: event.clientX,
  y: event.clientY,
  pointerId: event.pointerId,
  buttons: event.buttons,
});

/** The DOM side of the drag. It reads the newest options through `latest`, so it is created once. */
export const createKeySwapDragController = (latest: { current: KeySwapDragOptions }): KeySwapDragController => {
  let gesture: { pointerId: number; area: HTMLElement | null; dragging: boolean; userSelect: string } | null = null;

  const machine = createSwapDrag({
    targetAt: (x, y) => swapTargetAt(document, latest.current.areaRef.current, x, y),
    begin: source => latest.current.onBegin(source),
    hoverLayer: layer => latest.current.onHoverLayer(layer),
    hoverCell: cell => latest.current.onHoverCell(cell),
    drop: cell => latest.current.onDrop(cell),
    cancel: () => latest.current.onCancel(),
  });

  /* Declared before use by the listeners, which need it to detach themselves */
  let teardown = () => {};

  const settle = () => {
    if (!machine.isActive()) {
      teardown();
    }
  };

  const onLostCapture = () => {
    machine.cancel();
    settle();
  };

  const startDragging = () => {
    if (gesture === null) {
      return;
    }

    const area = latest.current.areaRef.current;
    gesture.dragging = true;
    gesture.area = area;

    /* Capture only past the threshold, so a plain click keeps its key as target */
    if (area !== null) {
      area.addEventListener("lostpointercapture", onLostCapture);

      try {
        area.setPointerCapture?.(gesture.pointerId);
      } catch {
        /* Keep dragging without capture, the window listeners still see every move */
      }
    }

    document.documentElement.classList.add(KEY_SWAP_ROOT_CLASS);
    gesture.userSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.getSelection?.()?.removeAllRanges();
  };

  const onMove = (event: PointerEvent) => {
    if (machine.move(pointOf(event)) === "started") {
      startDragging();
    }

    settle();
  };

  const onUp = (event: PointerEvent) => {
    machine.up(pointOf(event));
    settle();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (gesture === null || event.pointerId !== gesture.pointerId) {
      return;
    }

    machine.cancel();
    settle();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !machine.isDragging()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    machine.cancel();
    settle();
  };

  const onBlur = () => {
    machine.cancel();
    settle();
  };

  teardown = () => {
    if (gesture === null) {
      return;
    }

    const ended = gesture;
    gesture = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onBlur);

    if (ended.area !== null) {
      ended.area.removeEventListener("lostpointercapture", onLostCapture);

      try {
        ended.area.releasePointerCapture?.(ended.pointerId);
      } catch {
        /* The capture is already gone */
      }
    }

    if (ended.dragging) {
      document.documentElement.classList.remove(KEY_SWAP_ROOT_CLASS);
      document.body.style.userSelect = ended.userSelect;
    }
  };

  const onPointerDown = (event: React.PointerEvent) => {
    const options = latest.current;
    const area = options.areaRef.current;

    /* Clear on every press, since a press off the keys never reaches down() and would otherwise lose its click */
    if (gesture === null) {
      machine.clearClick();
    }

    if (!options.enabled || gesture !== null || area === null || event.button !== 0 || event.pointerType === "touch") {
      return;
    }

    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    const key = (event.target as Element | null)?.closest?.(".keyItem") ?? null;
    const source = key !== null && area.contains(key) ? cellOfKey(key) : null;

    if (source === null) {
      return;
    }

    machine.down({ x: event.clientX, y: event.clientY, pointerId: event.pointerId, buttons: event.buttons }, source);
    gesture = { pointerId: event.pointerId, area: null, dragging: false, userSelect: "" };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
  };

  const onClickCapture = (event: React.MouseEvent) => {
    if (machine.consumeClick()) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  return {
    handlers: {
      onPointerDown,
      onClickCapture,
      isActive: () => machine.isActive(),
      cancel: () => {
        machine.cancel();
        settle();
      },
    },
    dispose: () => {
      machine.reset();
      teardown();
    },
  };
};

/** Drag a key of `areaRef` and drop it on another key. Hovering a row with `data-key-swap-layer` reports that layer. */
export const useKeySwapDrag = (options: KeySwapDragOptions): KeySwapDragHandlers => {
  const latest = useRef(options);
  latest.current = options;
  const [controller] = useState(() => createKeySwapDragController(latest));

  useEffect(() => {
    if (!options.enabled) {
      controller.handlers.cancel();
    }
  }, [options.enabled, controller]);

  /* Unmount ends the gesture without callbacks, since the editor is gone */
  useEffect(() => () => controller.dispose(), [controller]);

  return controller.handlers;
};
