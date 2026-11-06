import React from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import LayersTab from "./LayersTab";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const storeValues: Record<string, unknown> = {};

vi.mock("@Renderer/utils/Store", () => ({
  default: { getStore: () => ({ get: (key: string) => storeValues[key], set: vi.fn() }) },
}));

/* Stand in for the on-screen keyboard, whose module graph vitest cannot load, and emit a typing key and a modifier */
vi.mock("@Renderer/modules/KeyPickerKeyboard", () => ({
  Picker: ({ onKeySelect }: { onKeySelect: (code: number) => void }) => (
    <>
      <button type="button" onClick={() => onKeySelect(0x04)}>
        pick a
      </button>
      <button type="button" onClick={() => onKeySelect(0xe1)}>
        pick shift
      </button>
    </>
  ),
}));

const renderTab = (base: number, modified: number, activeTab = "editor", action?: number) => {
  const onKeySelect = vi.fn();
  render(<LayersTab keyCode={{ base, modified }} onKeySelect={onKeySelect} activeTab={activeTab} action={action} />);
  return { onKeySelect };
};

const button = (name: string) => screen.getByRole("button", { name });

describe("LayersTab swap hands", () => {
  beforeEach(() => {
    // Turn on sk20 to show that the tap key picker does not depend on it
    storeValues["capabilities.sk20"] = true;
    storeValues["capabilities.swapHands"] = true;
    storeValues["capabilities.swapHandsSuperHold"] = false;
  });

  afterEach(() => {
    cleanup();
  });

  test("the block shows in the Layout editor", () => {
    renderTab(4, 0);

    expect(screen.getByText("Swap hands")).not.toBeNull();
  });

  test.each([
    ["Hold", 54372],
    ["Toggle", 54373],
    ["Tap-toggle", 54374],
    ["One-shot", 54375],
  ])("%s selects %i", (name, code) => {
    const { onKeySelect } = renderTab(4, 0);

    fireEvent.click(button(name));

    expect(onKeySelect).toHaveBeenCalledWith(code);
  });

  test("Hold, key on tap on a typing key keeps it as the tap key", () => {
    const { onKeySelect } = renderTab(4, 0);

    fireEvent.click(button("Hold, key on tap"));

    expect(onKeySelect).toHaveBeenCalledWith(54380);
  });

  test("Hold, key on tap on a key that can't be a tap key starts with Space", () => {
    // Shift to layer 2
    const { onKeySelect } = renderTab(1, 17450);

    fireEvent.click(button("Hold, key on tap"));

    expect(onKeySelect).toHaveBeenCalledWith(54420);
  });

  test("the tap key picker takes a typing key", () => {
    // Swap hands, Space on tap
    const { onKeySelect } = renderTab(0x2c, 54376);

    fireEvent.click(button("Swap hands key on tap"));
    fireEvent.click(button("pick a"));

    expect(onKeySelect).toHaveBeenCalledWith(54380);
  });

  test("the tap key picker ignores a modifier", () => {
    const { onKeySelect } = renderTab(0x2c, 54376);

    fireEvent.click(button("Swap hands key on tap"));
    fireEvent.click(button("pick shift"));

    expect(onKeySelect).not.toHaveBeenCalled();
  });

  test.each([["combo"], ["super"], ["macro"]])("the block is hidden in the %s picker", activeTab => {
    renderTab(4, 0, activeTab);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });

  test("the block is hidden on firmware without swap hands", () => {
    storeValues["capabilities.swapHands"] = false;

    renderTab(4, 0);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });
});

describe("LayersTab swap hands on a Superkey", () => {
  // Superkey actions: 0 tap, 1 hold, 2 tap and hold, 3 double tap, 4 double tap and hold
  const HOLD_ACTION = 1;

  beforeEach(() => {
    storeValues["capabilities.sk20"] = true;
    storeValues["capabilities.swapHands"] = true;
    storeValues["capabilities.swapHandsSuperHold"] = true;
  });

  afterEach(() => {
    cleanup();
  });

  test("the hold action offers only Hold", () => {
    renderTab(4, 0, "super", HOLD_ACTION);

    expect(screen.getByText("Swap hands")).not.toBeNull();
    expect(button("Hold")).not.toBeNull();
    expect(
      ["Toggle", "Tap-toggle", "One-shot", "Hold, key on tap"].filter(name => screen.queryByRole("button", { name })),
    ).toEqual([]);
  });

  test("Hold on the hold action selects 54372", () => {
    const { onKeySelect } = renderTab(4, 0, "super", HOLD_ACTION);

    fireEvent.click(button("Hold"));

    expect(onKeySelect).toHaveBeenCalledWith(54372);
  });

  test("Hold shows as selected on a hold action that has it", () => {
    renderTab(54372, 0, "super", HOLD_ACTION);

    expect(button("Hold").getAttribute("aria-pressed")).toBe("true");
  });

  test.each([
    [0], // tap
    [2], // tap and hold
    [3], // double tap
    [4], // double tap and hold
  ])("the block is hidden on action %i", action => {
    renderTab(4, 0, "super", action);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });

  test("the block is hidden on firmware that ignores swap keys from a Superkey", () => {
    storeValues["capabilities.swapHandsSuperHold"] = false;

    renderTab(4, 0, "super", HOLD_ACTION);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });

  test("the block is hidden on firmware without swap hands", () => {
    storeValues["capabilities.swapHands"] = false;

    renderTab(4, 0, "super", HOLD_ACTION);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });

  test.each([["combo"], ["macro"]])("the block is hidden in the %s picker on the hold action index", activeTab => {
    renderTab(4, 0, activeTab, HOLD_ACTION);

    expect(screen.queryByText("Swap hands")).toBeNull();
  });
});
