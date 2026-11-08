/* eslint-disable no-bitwise */
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
const GUI_FLAG = 16;
const SHIFT_FLAG = 8;

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

  test("adding a modifier to a hold key keeps the hold with keepHold while no hold control shows", () => {
    const onKeySelect = vi.fn();
    const { container } = render(
      <ModPicker keyCode={{ base: 0x2b, modified: 0x3000 }} onKeySelect={onKeySelect} isStandardView={false} keepHold />,
    );

    expect(container.querySelector(HOLD_CHECKBOX)).toBeNull();
    fireEvent.click(container.querySelector(SHIFT));

    expect(onKeySelect).toHaveBeenCalledWith(0x382b);
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

describe("ModPicker per-modifier hold row", () => {
  const ROW = ".layerHoldModsPicker";
  const holdBox = (name: string) => `#input-holdMod${name}-checkbox`;
  const CTRL_RADIO = "#input-addModControl-radio";

  afterEach(() => {
    cleanup();
  });

  // Cmd+Shift+Tab is 0x182b, with Cmd held 16 and Shift 8
  const renderRow = (modified: number, heldMask: number, accept = true, allowAltGr = true) => {
    const onKeySelect = vi.fn();
    const onHoldChange = vi.fn(() => accept);
    const { container } = render(
      <ModPicker
        keyCode={{ base: 0x2b, modified }}
        onKeySelect={onKeySelect}
        isStandardView={false}
        allowLayerHold
        holdMods={{ heldMask, onHoldChange }}
        allowAltGr={allowAltGr}
      />,
    );
    const state = (selector: string) => container.querySelector(selector).getAttribute("data-state");
    const disabled = (selector: string) => container.querySelector(selector).hasAttribute("disabled");
    const click = (selector: string) => fireEvent.click(container.querySelector(selector));
    return { container, onKeySelect, onHoldChange, state, disabled, click };
  };

  test("replaces the single checkbox, even with allowLayerHold", () => {
    const { container } = renderRow(0x9800, GUI_FLAG);

    expect(container.querySelector(ROW).textContent).toContain("Hold until layer change:");
    expect(container.querySelector(HOLD_CHECKBOX)).toBeNull();
  });

  test("ticks the held modifiers and disables those the shortcut lacks", () => {
    const { state, disabled } = renderRow(0x9800, GUI_FLAG);

    expect(["Shift", "Ctrl", "Gui", "Alt", "AltGr"].map(name => [name, state(holdBox(name)), disabled(holdBox(name))])).toEqual([
      ["Shift", "unchecked", false],
      ["Ctrl", "unchecked", true],
      ["Gui", "checked", false],
      ["Alt", "unchecked", true],
      ["AltGr", "unchecked", true],
    ]);
  });

  test("a legacy hold shows every modifier ticked when the editor passes its mask", () => {
    const { state } = renderRow(0x3800, GUI_FLAG | SHIFT_FLAG);

    expect([state(holdBox("Shift")), state(holdBox("Gui"))]).toEqual(["checked", "checked"]);
  });

  test("ticking a modifier asks for the shortcut with it held", () => {
    const { click, onHoldChange, onKeySelect } = renderRow(0x9800, GUI_FLAG);

    click(holdBox("Shift"));

    expect(onHoldChange).toHaveBeenCalledWith(0x182b, GUI_FLAG | SHIFT_FLAG);
    expect(onKeySelect).not.toHaveBeenCalled();
  });

  test("unticking the last held modifier asks for none held", () => {
    const { click, onHoldChange } = renderRow(0x9800, GUI_FLAG);

    click(holdBox("Gui"));

    expect(onHoldChange).toHaveBeenCalledWith(0x182b, 0);
  });

  test("a newly added modifier starts unticked", () => {
    const { click, onHoldChange, onKeySelect } = renderRow(0x9800, GUI_FLAG);

    click(CTRL_RADIO);

    expect(onHoldChange).toHaveBeenCalledWith(0x192b, GUI_FLAG);
    expect(onKeySelect).not.toHaveBeenCalled();
  });

  test("a removed modifier loses its tick", () => {
    const { click, onHoldChange } = renderRow(0x3800, GUI_FLAG | SHIFT_FLAG);

    click(SHIFT);

    expect(onHoldChange).toHaveBeenCalledWith(0x102b, GUI_FLAG);
  });

  test("a refused modifier change puts the modifier buttons back", () => {
    const { click, state } = renderRow(0x9800, GUI_FLAG, false);

    click(CTRL_RADIO);

    expect(state(CTRL_RADIO)).toBe("unchecked");
    expect([state(SHIFT), state(GUI)]).toEqual(["checked", "checked"]);
  });

  test("an accepted modifier change keeps the buttons until the new code arrives", () => {
    const { click, state } = renderRow(0x9800, GUI_FLAG, true);

    click(CTRL_RADIO);

    expect(state(CTRL_RADIO)).toBe("checked");
  });

  test("allowAltGr={false} hides the AltGr box", () => {
    const { container } = renderRow(0x9800, GUI_FLAG, true, false);

    expect(container.querySelector(holdBox("AltGr"))).toBeNull();
    expect(container.querySelector(holdBox("Alt"))).not.toBeNull();
  });

  test("a key without modifiers has every box disabled", () => {
    const { disabled } = renderRow(0, 0);

    expect(["Shift", "Ctrl", "Gui", "Alt", "AltGr"].map(name => disabled(holdBox(name)))).toEqual([true, true, true, true, true]);
  });
});
