import { describe, expect, test, vi } from "vitest";
import { detectTab } from "./detectTab";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("detectTab", () => {
  test.each([
    [0x302b, "tabLayers", "tabKeys"], // Hold key right after a layer key
    [0x302b, undefined, "tabKeys"], // Hold key on open
    [0x982b, "tabLayers", "tabKeys"], // Partial hold right after a layer key
    [0xb82b, undefined, "tabKeys"], // Partial hold in slot 1 on open
    [0x102b, "tabLayers", "tabLayers"], // Shortcut stays on the open Layers tab
    [17451, "tabKeys", "tabLayers"], // Shift to layer 2
    [54115, "tabKeys", "tabKeys"], // Autoshift a
    [54372, "tabKeys", "tabLayers"], // Swap hands while held
    [54420, "tabKeys", "tabLayers"], // Swap hands, Space on tap
    [54631, undefined, "tabLayers"], // Last swap hands tap code
  ])("keycode %i with %s open gives %s", (keyCode, currentTab, expected) => {
    expect(detectTab(keyCode, currentTab)).toBe(expected);
  });
});

describe("detectTab with the Multi-action tab", () => {
  test.each([
    [53980, true, "tabMultiAction"], // Superkey 1
    [54107, true, "tabMultiAction"], // Superkey 128
    [53980, false, "tabSuperKeys"], // Superkey 1 without the tab
    [54107, false, "tabSuperKeys"], // Superkey 128 without the tab
    [49169 + 4, true, "tabMultiAction"], // A with left Ctrl on hold
    [49169 + 4, false, "tabLayers"], // A with left Ctrl on hold without the tab
    [51218 + 0x2c, true, "tabMultiAction"], // Space with layer 1 on hold
    [49169, true, "tabLayers"], // Left Ctrl on hold with no tap key
    [54108, true, "tabWireless"], // First wireless key
    [54111, false, "tabWireless"], // Last wireless key
    [4, true, "tabKeys"], // A
  ])("keycode %i with the tab %s gives %s", (keyCode, hasMultiAction, expected) => {
    expect(detectTab(keyCode, undefined, hasMultiAction)).toBe(expected);
  });
});
