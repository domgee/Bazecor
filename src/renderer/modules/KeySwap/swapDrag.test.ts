import { afterEach, describe, expect, test, vi } from "vitest";
import { KEY_SWAP_LAYER_ATTR, SwapCellTarget, SwapDragDeps, SwapTarget, createSwapDrag, swapTargetAt } from "./swapDrag";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const source: SwapCellTarget = { kind: "cell", layer: 1, position: 4, ledIndex: 4 };
const keyB: SwapCellTarget = { kind: "cell", layer: 1, position: 7, ledIndex: 9 };
const keyC: SwapCellTarget = { kind: "cell", layer: 2, position: 7, ledIndex: 9 };

const point = (x: number, y = 0, extra: { pointerId?: number; buttons?: number } = {}) => ({
  x,
  y,
  pointerId: extra.pointerId ?? 1,
  buttons: extra.buttons ?? 1,
});

const setup = (begin = true) => {
  let target: SwapTarget = null;
  const deps = {
    targetAt: vi.fn(() => target),
    begin: vi.fn(() => begin),
    hoverLayer: vi.fn(),
    hoverCell: vi.fn(),
    drop: vi.fn(),
    cancel: vi.fn(),
  } satisfies SwapDragDeps;
  const drag = createSwapDrag(deps);
  const pointAt = (next: SwapTarget) => {
    target = next;
  };

  return { deps, drag, pointAt };
};

describe("createSwapDrag", () => {
  test("a press that stays under the threshold is a click", () => {
    const { deps, drag } = setup();

    drag.down(point(0), source);
    drag.move(point(3, 4));
    drag.up(point(3, 4));

    expect(deps.begin).not.toHaveBeenCalled();
    expect(drag.isActive()).toBe(false);
    expect(drag.consumeClick()).toBe(false);
  });

  test("moving past the threshold starts the drag", () => {
    const { deps, drag } = setup();

    drag.down(point(0), source);
    const started = drag.move(point(4, 4));

    expect(started).toBe("started");
    expect(deps.begin).toHaveBeenCalledWith(source);
    expect(drag.isDragging()).toBe(true);
  });

  test("a refused begin ends the gesture", () => {
    const { drag } = setup(false);

    drag.down(point(0), source);

    expect(drag.move(point(10))).toBeUndefined();
    expect(drag.isActive()).toBe(false);
  });

  test("reports a layer and a cell only when they change", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));

    // The source layer shows already, so hovering its row changes nothing
    pointAt({ kind: "layer", layer: 1 });
    drag.move(point(11));
    pointAt({ kind: "layer", layer: 2 });
    drag.move(point(12));
    drag.move(point(13));
    pointAt(keyC);
    drag.move(point(14));
    drag.move(point(15));

    expect(deps.hoverLayer.mock.calls).toEqual([[2]]);
    expect(deps.hoverCell.mock.calls).toEqual([[keyC]]);
  });

  test("clears the hovered cell when the pointer leaves the keys", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));
    pointAt(keyB);
    drag.move(point(11));

    pointAt(null);
    drag.move(point(12));

    expect(deps.hoverCell.mock.calls).toEqual([[keyB], [null]]);
  });

  test("a release on a key drops there and eats one click", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));

    pointAt(keyB);
    drag.up(point(20));

    expect(deps.drop).toHaveBeenCalledWith(keyB);
    expect(deps.cancel).not.toHaveBeenCalled();
    expect(drag.isActive()).toBe(false);
    expect(drag.consumeClick()).toBe(true);
    expect(drag.consumeClick()).toBe(false);
  });

  test("a release off the keys cancels", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));

    pointAt({ kind: "layer", layer: 2 });
    drag.up(point(20));

    expect(deps.drop).not.toHaveBeenCalled();
    expect(deps.cancel).toHaveBeenCalledTimes(1);
  });

  test("ignores another pointer", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));
    pointAt(keyB);

    drag.move(point(30, 0, { pointerId: 2 }));
    drag.up(point(30, 0, { pointerId: 2 }));

    expect(deps.hoverCell).not.toHaveBeenCalled();
    expect(deps.drop).not.toHaveBeenCalled();
    expect(drag.isDragging()).toBe(true);
  });

  test("a move without a pressed button cancels a drag", () => {
    const { deps, drag, pointAt } = setup();
    drag.down(point(0), source);
    drag.move(point(10));
    pointAt(keyB);

    drag.move(point(20, 0, { buttons: 0 }));

    expect(deps.drop).not.toHaveBeenCalled();
    expect(deps.cancel).toHaveBeenCalledTimes(1);
    expect(drag.isActive()).toBe(false);
  });

  test("a move without a pressed button ends a pending press quietly", () => {
    const { deps, drag } = setup();
    drag.down(point(0), source);

    drag.move(point(20, 0, { buttons: 0 }));

    expect(deps.begin).not.toHaveBeenCalled();
    expect(drag.isActive()).toBe(false);
    expect(drag.consumeClick()).toBe(false);
  });

  test("cancel ends a drag with the callback and a pending press without it", () => {
    const dragging = setup();
    dragging.drag.down(point(0), source);
    dragging.drag.move(point(10));
    const pending = setup();
    pending.drag.down(point(0), source);

    dragging.drag.cancel();
    pending.drag.cancel();

    expect(dragging.deps.cancel).toHaveBeenCalledTimes(1);
    expect(pending.deps.cancel).not.toHaveBeenCalled();
    expect(pending.drag.isActive()).toBe(false);
  });

  test("reset ends a drag without callbacks", () => {
    const { deps, drag } = setup();
    drag.down(point(0), source);
    drag.move(point(10));

    drag.reset();

    expect(deps.cancel).not.toHaveBeenCalled();
    expect(drag.isActive()).toBe(false);
    expect(drag.consumeClick()).toBe(false);
  });

  test("the next press clears a click suppression that no click used", () => {
    const { drag } = setup();
    drag.down(point(0), source);
    drag.move(point(10));
    drag.cancel();

    drag.down(point(0), source);
    drag.up(point(0));

    expect(drag.consumeClick()).toBe(false);
  });
});

describe("swapTargetAt", () => {
  const originalElementFromPoint = document.elementFromPoint;

  afterEach(() => {
    document.body.innerHTML = "";
    document.elementFromPoint = originalElementFromPoint;
  });

  const render = () => {
    document.body.innerHTML = `
      <div id="area">
        <svg><g class="keyItem" data-layer="2" data-key-index="14" data-led-index="20"><rect id="inside" /></g></svg>
      </div>
      <svg><g class="keyItem" data-layer="2" data-key-index="3" data-led-index="3"><rect id="outside" /></g></svg>
      <div ${KEY_SWAP_LAYER_ATTR}="5"><em id="row">#6.</em></div>`;
    return document.getElementById("area");
  };

  const at = (id: string | null) => {
    document.elementFromPoint = vi.fn(() => (id === null ? null : document.getElementById(id)));
  };

  test("finds the key under the point inside the area", () => {
    const area = render();
    at("inside");

    expect(swapTargetAt(document, area, 0, 0)).toEqual({ kind: "cell", layer: 2, position: 14, ledIndex: 20 });
  });

  test("ignores a key outside the area", () => {
    const area = render();
    at("outside");

    expect(swapTargetAt(document, area, 0, 0)).toBeNull();
  });

  test("finds the layer row under the point", () => {
    const area = render();
    at("row");

    expect(swapTargetAt(document, area, 0, 0)).toEqual({ kind: "layer", layer: 5 });
  });

  test("is null over nothing or without elementFromPoint", () => {
    const area = render();
    at(null);

    expect(swapTargetAt(document, area, 0, 0)).toBeNull();

    document.elementFromPoint = undefined as unknown as Document["elementFromPoint"];

    expect(swapTargetAt(document, area, 0, 0)).toBeNull();
  });
});
