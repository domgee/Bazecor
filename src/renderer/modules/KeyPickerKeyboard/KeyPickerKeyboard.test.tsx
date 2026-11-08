import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import Light from "@Renderer/theme/LightTheme";
import KeyPickerKeyboard from "./KeyPickerKeyboard";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const storeValues: Record<string, unknown> = {};

vi.mock("@Renderer/utils/Store", () => ({
  default: { getStore: () => ({ get: (key: string) => storeValues[key], set: vi.fn() }) },
}));

/* Stand in for the on-screen keyboard and the other tabs, whose module graphs vitest cannot load */
vi.mock(".", () => ({ Picker: () => <div /> }));
vi.mock("@Renderer/modules/KeysTabs/SuperkeysTab", () => ({ default: () => <div /> }));
vi.mock("@Renderer/modules/KeysTabs/MouseTab", () => ({ default: () => <div /> }));

const HOLD_CHECKBOX = "#input-holdUntilLayerChange-checkbox";
const HOLD_ROW = ".layerHoldModsPicker";

// Cmd+Shift+Tab with Cmd held, in slot 0
const renderPicker = (props: { allowLayerHold?: boolean; holdMods?: { heldMask: number; onHoldChange: () => boolean } }) =>
  render(
    <ThemeProvider theme={Light}>
      <KeyPickerKeyboard
        mouseWheel={0}
        resetScroll={vi.fn()}
        onKeySelect={vi.fn()}
        code={{ base: 0x2b, modified: 0x9800 }}
        macros={[]}
        superkeys={[]}
        keyIndex={0}
        actTab="editor"
        selectedlanguage="en-US"
        isWireless={false}
        allowLayerHold={props.allowLayerHold}
        holdMods={props.holdMods}
      />
    </ThemeProvider>,
  );

describe("KeyPickerKeyboard hold controls", () => {
  beforeEach(() => {
    storeValues["capabilities.layerHold"] = true;
  });

  afterEach(() => {
    cleanup();
  });

  test("holdMods shows the row in ModPicker without allowLayerHold", () => {
    const { container } = renderPicker({ holdMods: { heldMask: 16, onHoldChange: () => true } });

    expect(container.querySelector(HOLD_ROW)).not.toBeNull();
    expect(container.querySelector("#input-holdModGui-checkbox").getAttribute("data-state")).toBe("checked");
    expect(container.querySelector(HOLD_CHECKBOX)).toBeNull();
  });

  test("allowLayerHold alone shows the single checkbox", () => {
    const { container } = renderPicker({ allowLayerHold: true });

    expect(container.querySelector(HOLD_CHECKBOX)).not.toBeNull();
    expect(container.querySelector(HOLD_ROW)).toBeNull();
  });

  test("firmware without layer hold shows neither", () => {
    storeValues["capabilities.layerHold"] = false;

    const { container } = renderPicker({ allowLayerHold: true, holdMods: { heldMask: 16, onHoldChange: () => true } });

    expect(container.querySelector(HOLD_CHECKBOX)).toBeNull();
    expect(container.querySelector(HOLD_ROW)).toBeNull();
  });
});
