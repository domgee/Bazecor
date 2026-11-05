import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ModPicker from "./ModPicker";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const HOLD_CHECKBOX = "#input-holdUntilLayerChange-checkbox";
const SHIFT = "#input-addModShift-radio";
const GUI = "#input-addModOS-radio";

const renderModPicker = (base: number, modified: number, allowLayerHold: boolean) => {
  const onKeySelect = vi.fn();
  const { container } = render(
    <ModPicker keyCode={{ base, modified }} onKeySelect={onKeySelect} isStandardView={false} allowLayerHold={allowLayerHold} />,
  );
  const click = (selector: string) => fireEvent.click(container.querySelector(selector));
  return { container, onKeySelect, click };
};

describe("ModPicker Hold until layer change", () => {
  afterEach(() => {
    cleanup();
  });

  test("the checkbox is hidden without allowLayerHold", () => {
    const { container } = renderModPicker(0x2b, 0x1000, false);

    expect(container.querySelector(HOLD_CHECKBOX)).toBeNull();
  });

  test("checking it on Cmd+Tab selects the hold key", () => {
    const { container, onKeySelect, click } = renderModPicker(0x2b, 0x1000, true);

    expect(container.querySelector(HOLD_CHECKBOX).hasAttribute("disabled")).toBe(false);
    expect(container.querySelector(HOLD_CHECKBOX).getAttribute("data-state")).toBe("unchecked");
    click(HOLD_CHECKBOX);

    expect(onKeySelect).toHaveBeenCalledWith(0x302b);
  });

  test("unchecking it on a hold key selects the plain shortcut", () => {
    const { container, onKeySelect, click } = renderModPicker(0x2b, 0x3000, true);

    expect(container.querySelector(HOLD_CHECKBOX).getAttribute("data-state")).toBe("checked");
    click(HOLD_CHECKBOX);

    expect(onKeySelect).toHaveBeenCalledWith(0x102b);
  });

  test("adding a modifier to a hold key keeps the hold", () => {
    const { onKeySelect, click } = renderModPicker(0x2b, 0x3000, true);

    click(SHIFT);

    expect(onKeySelect).toHaveBeenCalledWith(0x382b);
  });

  test("removing the last modifier from a hold key selects the bare key", () => {
    const { onKeySelect, click } = renderModPicker(0x2b, 0x3000, true);

    click(GUI);

    expect(onKeySelect).toHaveBeenCalledWith(0x2b);
  });

  test("editing a hold key without allowLayerHold drops the hold", () => {
    const { onKeySelect, click } = renderModPicker(0x2b, 0x3000, false);

    click(SHIFT);

    expect(onKeySelect).toHaveBeenCalledWith(0x182b);
  });

  test("the checkbox is disabled on a key without modifiers", () => {
    const { container } = renderModPicker(0x2b, 0, true);

    expect(container.querySelector(HOLD_CHECKBOX).hasAttribute("disabled")).toBe(true);
  });
});
