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

const renderTab = (base: number, modified: number, activeTab = "editor", action: number | undefined = undefined) => {
  const onKeySelect = vi.fn();
  const { container } = render(
    <ThemeProvider theme={Light}>
      <ModifiersTab keyCode={{ base, modified }} onKeySelect={onKeySelect} activeTab={activeTab} action={action} />
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

describe("ModifiersTab Repeat key", () => {
  afterEach(() => {
    cleanup();
    delete storeValues["capabilities.repeatKey"];
  });

  test.each([
    [false], // Firmware without the marker
    [undefined], // Capabilities not read yet
  ])("the Repeat key is hidden when the capability is %s", capability => {
    storeValues["capabilities.repeatKey"] = capability;

    // A
    renderTab(4, 0);

    expect(screen.queryByText("Repeat key")).toBeNull();
  });

  test("a click on Repeat assigns the Repeat key", () => {
    storeValues["capabilities.repeatKey"] = true;
    const { onKeySelect } = renderTab(4, 0);

    fireEvent.click(screen.getByRole("button", { name: "Repeat" }));

    expect(onKeySelect).toHaveBeenLastCalledWith(53594);
  });

  test("the Repeat button is selected on the Repeat key", () => {
    storeValues["capabilities.repeatKey"] = true;

    renderTab(53594, 0);

    expect(screen.getByRole("button", { name: "Repeat" }).getAttribute("aria-pressed")).toBe("true");
  });

  test.each([
    ["super", 0], // Superkey Tap action
    ["combo", undefined], // Combo output and previous-key rule output
  ])("the Repeat key is offered with activeTab %s", (activeTab, action) => {
    storeValues["capabilities.repeatKey"] = true;

    renderTab(4, 0, activeTab, action);

    expect(screen.getByRole("button", { name: "Repeat" })).not.toBeNull();
  });
});
