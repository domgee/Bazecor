import React, { useRef } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { KEY_SWAP_ROOT_CLASS } from "./keySwap";
import { KeySwapDragOptions, useKeySwapDrag } from "./swapDrag";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

// jsdom has no reliable PointerEvent, so build one on MouseEvent, which carries clientX, button and buttons
class TestPointerEvent extends MouseEvent {
  pointerId: number;

  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

type Callbacks = Omit<KeySwapDragOptions, "enabled" | "areaRef">;

const Harness = ({
  enabled = true,
  callbacks,
  onKeyClick,
}: {
  enabled?: boolean;
  callbacks: Callbacks;
  onKeyClick: () => void;
}) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const handlers = useKeySwapDrag({ enabled, areaRef, ...callbacks });

  return (
    <div data-testid="area" ref={areaRef} onPointerDown={handlers.onPointerDown} onClickCapture={handlers.onClickCapture}>
      <svg>
        <g className="keyItem" data-layer="0" data-key-index="1" data-led-index="1" onClick={onKeyClick}>
          <rect data-testid="source" />
        </g>
        <g className="keyItem" data-layer="0" data-key-index="2" data-led-index="5">
          <rect data-testid="target" />
        </g>
      </svg>
      <div data-testid="outside" />
    </div>
  );
};

const originalPointerEvent = window.PointerEvent;
const originalElementFromPoint = document.elementFromPoint;
const originalSetCapture = HTMLElement.prototype.setPointerCapture;
const originalReleaseCapture = HTMLElement.prototype.releasePointerCapture;

let underPointer: Element | null = null;

const setup = (props: { enabled?: boolean; begin?: boolean } = {}) => {
  const callbacks = {
    onBegin: vi.fn(() => props.begin ?? true),
    onHoverLayer: vi.fn(),
    onHoverCell: vi.fn(),
    onDrop: vi.fn(),
    onCancel: vi.fn(),
  };
  const onKeyClick = vi.fn();
  const view = render(<Harness enabled={props.enabled} callbacks={callbacks} onKeyClick={onKeyClick} />);
  const rerender = (enabled: boolean) =>
    view.rerender(<Harness enabled={enabled} callbacks={callbacks} onKeyClick={onKeyClick} />);

  return { callbacks, onKeyClick, view, rerender };
};

const press = (x = 0) => {
  fireEvent.pointerDown(screen.getByTestId("source"), { clientX: x, clientY: 0, button: 0, buttons: 1, pointerId: 1 });
};

const moveTo = (testId: string, x: number) => {
  underPointer = screen.getByTestId(testId);
  act(() => {
    window.dispatchEvent(new TestPointerEvent("pointermove", { clientX: x, clientY: 0, buttons: 1, pointerId: 1 }));
  });
};

const release = (x: number) => {
  act(() => {
    window.dispatchEvent(new TestPointerEvent("pointerup", { clientX: x, clientY: 0, buttons: 0, pointerId: 1 }));
  });
};

const startDrag = () => {
  press();
  moveTo("source", 10);
};

describe("useKeySwapDrag", () => {
  beforeEach(() => {
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
    document.elementFromPoint = vi.fn(() => underPointer);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    document.body.style.userSelect = "text";
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.PointerEvent = originalPointerEvent;
    document.elementFromPoint = originalElementFromPoint;
    HTMLElement.prototype.setPointerCapture = originalSetCapture;
    HTMLElement.prototype.releasePointerCapture = originalReleaseCapture;
    document.documentElement.classList.remove(KEY_SWAP_ROOT_CLASS);
    document.body.style.userSelect = "";
    underPointer = null;
  });

  test("attaches window listeners on press and removes them after the drop", () => {
    const { callbacks } = setup();
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    startDrag();
    moveTo("target", 30);
    release(30);

    // React dispatches its own error listener around each event in development, so look only at the gesture's
    const gestureEvents = (calls: unknown[][]) =>
      calls
        .map(call => call[0])
        .filter(type => type !== "error")
        .sort();
    const added = gestureEvents(add.mock.calls);
    const removed = gestureEvents(remove.mock.calls);
    expect(added).toEqual(["blur", "keydown", "pointercancel", "pointermove", "pointerup"]);
    expect(removed).toEqual(added);
    expect(callbacks.onDrop).toHaveBeenCalledWith({ kind: "cell", layer: 0, position: 2, ledIndex: 5 });
  });

  test("captures the pointer on the area only past the threshold", () => {
    setup();

    press();

    expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();

    moveTo("source", 10);

    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(1);
  });

  test("keeps dragging when the capture throws", () => {
    HTMLElement.prototype.setPointerCapture = vi.fn(() => {
      throw new Error("no capture");
    });
    const { callbacks } = setup();

    startDrag();
    moveTo("target", 30);
    release(30);

    expect(callbacks.onDrop).toHaveBeenCalledTimes(1);
  });

  test("cancels when the area loses the capture", () => {
    const { callbacks } = setup();
    startDrag();

    act(() => {
      fireEvent(screen.getByTestId("area"), new Event("lostpointercapture"));
    });

    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains(KEY_SWAP_ROOT_CLASS)).toBe(false);
  });

  test("sets the cursor class and user-select while dragging and restores them after", () => {
    setup();
    startDrag();

    expect(document.documentElement.classList.contains(KEY_SWAP_ROOT_CLASS)).toBe(true);
    expect(document.body.style.userSelect).toBe("none");

    moveTo("outside", 30);
    release(30);

    expect(document.documentElement.classList.contains(KEY_SWAP_ROOT_CLASS)).toBe(false);
    expect(document.body.style.userSelect).toBe("text");
  });

  test("Escape cancels a drag and stops the key there", () => {
    const { callbacks } = setup();
    const onKeyDown = vi.fn();
    document.addEventListener("keydown", onKeyDown);
    startDrag();

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });

    document.removeEventListener("keydown", onKeyDown);
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  test("Escape during a pending press does nothing", () => {
    const { callbacks } = setup();
    press();

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    moveTo("source", 10);
    expect(callbacks.onBegin).toHaveBeenCalledTimes(1);
  });

  test("losing the window focus cancels", () => {
    const { callbacks } = setup();
    startDrag();

    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  test("turning disabled cancels a drag", () => {
    const { callbacks, rerender } = setup();
    startDrag();

    rerender(false);

    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(document.documentElement.classList.contains(KEY_SWAP_ROOT_CLASS)).toBe(false);
  });

  test("ignores a press while disabled", () => {
    const { callbacks } = setup({ enabled: false });

    startDrag();

    expect(callbacks.onBegin).not.toHaveBeenCalled();
  });

  test("ignores a press with a modifier or another button", () => {
    const { callbacks } = setup();

    fireEvent.pointerDown(screen.getByTestId("source"), { clientX: 0, button: 0, buttons: 1, pointerId: 1, shiftKey: true });
    moveTo("source", 10);
    fireEvent.pointerDown(screen.getByTestId("source"), { clientX: 0, button: 2, buttons: 2, pointerId: 1 });
    moveTo("source", 20);

    expect(callbacks.onBegin).not.toHaveBeenCalled();
  });

  test("unmounting mid-drag ends it without callbacks", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { callbacks, view } = setup();
    startDrag();

    view.unmount();

    expect(callbacks.onCancel).not.toHaveBeenCalled();
    expect(remove.mock.calls.map(call => call[0])).toContain("pointermove");
    expect(document.documentElement.classList.contains(KEY_SWAP_ROOT_CLASS)).toBe(false);
  });

  test("eats the click that ends a drag and lets the next click reach the key", () => {
    const { onKeyClick } = setup();
    startDrag();
    moveTo("target", 30);
    release(30);

    fireEvent.click(screen.getByTestId("source"));
    fireEvent.click(screen.getByTestId("source"));

    expect(onKeyClick).toHaveBeenCalledTimes(1);
  });

  test("a plain click reaches the key", () => {
    const { onKeyClick, callbacks } = setup();

    press();
    release(0);
    fireEvent.click(screen.getByTestId("source"));

    expect(callbacks.onBegin).not.toHaveBeenCalled();
    expect(onKeyClick).toHaveBeenCalledTimes(1);
  });
});
