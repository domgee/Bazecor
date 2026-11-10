import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import Light from "@Renderer/theme/LightTheme";
import ModifiersTab from "./ModifiersTab";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const storeValues: Record<string, unknown> = {};

vi.mock("@Renderer/utils/Store", () => ({
  default: { getStore: () => ({ get: (key: string) => storeValues[key], set: vi.fn() }) },
}));

const renderTab = (base: number, modified: number) => {
  const onKeySelect = vi.fn();
  const { container } = render(
    <ThemeProvider theme={Light}>
      <ModifiersTab keyCode={{ base, modified }} onKeySelect={onKeySelect} activeTab="editor" />
    </ThemeProvider>,
  );
  return { onKeySelect, container };
};

describe("ModifiersTab dual-function keys", () => {
  beforeEach(() => {
    // Turn off sk20, where the tab used to offer a key on tap
    storeValues["capabilities.sk20"] = false;
  });

  afterEach(() => {
    cleanup();
  });

  test("the tab offers no key on tap, which the Multi-action tab sets up", () => {
    // Left Shift
    renderTab(0xe1, 0);

    expect(screen.queryByText("Add a key on tap")).toBeNull();
  });

  test("a modifier picked on a dual-function key becomes a plain modifier", () => {
    // A with left Ctrl on hold
    const { onKeySelect, container } = renderTab(4, 49169);
    const buttons = container.querySelectorAll("button");

    // The first button is left Shift
    fireEvent.click(buttons[0]);

    expect(onKeySelect).toHaveBeenLastCalledWith(0xe1);
  });
});
