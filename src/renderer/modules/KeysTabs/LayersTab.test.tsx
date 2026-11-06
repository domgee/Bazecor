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

const renderTab = (base: number, modified: number, activeTab = "editor") => {
  const onKeySelect = vi.fn();
  render(<LayersTab keyCode={{ base, modified }} onKeySelect={onKeySelect} activeTab={activeTab} />);
  return { onKeySelect };
};

const button = (name: string) => screen.getByRole("button", { name });

describe("LayersTab swap hands", () => {
  beforeEach(() => {
    // Turn on sk20 to show that the tap key picker does not depend on it
    storeValues["capabilities.sk20"] = true;
    storeValues["capabilities.swapHands"] = true;
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
