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

  test("checking it on a partial hold selects the legacy hold of its shortcut", () => {
    // 0xb82b is Cmd+Shift+Tab in slot 1, whose slot bit is the legacy hold bit
    const { container, onKeySelect, click } = renderModPicker(0x2b, 0xb800, true);

    expect(container.querySelector(HOLD_CHECKBOX).getAttribute("data-state")).toBe("unchecked");
    click(HOLD_CHECKBOX);

    expect(onKeySelect).toHaveBeenCalledWith(0x382b);
  });

  test("the checkbox is disabled on a key without modifiers", () => {
    const { container } = renderModPicker(0x2b, 0, true);

    expect(container.querySelector(HOLD_CHECKBOX).hasAttribute("disabled")).toBe(true);
  });
});

describe("ModPicker AltGr", () => {
  afterEach(() => {
    cleanup();
  });

  test("AltGr is offered by default", () => {
    const { container } = render(<ModPicker keyCode={{ base: 6, modified: 0 }} onKeySelect={vi.fn()} isStandardView={false} />);

    expect(container.querySelector("#input-addModAltGr-radio")).not.toBeNull();
  });

  test("allowAltGr={false} hides AltGr and keeps the other modifiers", () => {
    const { container } = render(
      <ModPicker keyCode={{ base: 6, modified: 0 }} onKeySelect={vi.fn()} isStandardView={false} allowAltGr={false} />,
    );

    expect(container.querySelector("#input-addModAltGr-radio")).toBeNull();
    expect(container.querySelector("#input-addModAlt-radio")).not.toBeNull();
  });
});

describe("ModPicker idPrefix", () => {
  afterEach(() => {
    cleanup();
  });

  test("a label click in a prefixed ModPicker only changes that picker", () => {
    const editorSelect = vi.fn();
    const dialogSelect = vi.fn();
    const { container } = render(
      <>
        <ModPicker keyCode={{ base: 6, modified: 0 }} onKeySelect={editorSelect} isStandardView={false} />
        <ModPicker keyCode={{ base: 7, modified: 0 }} onKeySelect={dialogSelect} isStandardView={false} idPrefix="dialog-" />
      </>,
    );

    fireEvent.click(container.querySelector('label[for="input-dialog-addModControl-radio"]'));

    expect(dialogSelect).toHaveBeenCalledWith(0x107);
    expect(editorSelect).not.toHaveBeenCalled();
  });

  test("without a prefix the ids stay as they were", () => {
    const { container } = render(<ModPicker keyCode={{ base: 6, modified: 0 }} onKeySelect={vi.fn()} isStandardView={false} />);

    expect(container.querySelector("#input-addModControl-radio")).not.toBeNull();
  });
});
