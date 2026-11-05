import { describe, expect, test, vi } from "vitest";
import { detectTab } from "./detectTab";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("detectTab", () => {
  test.each([
    [0x302b, "tabLayers", "tabKeys"], // Hold key right after a layer key
    [0x302b, undefined, "tabKeys"], // Hold key on open
    [0x102b, "tabLayers", "tabLayers"], // Shortcut stays on the open Layers tab
    [17451, "tabKeys", "tabLayers"], // Shift to layer 2
    [54115, "tabKeys", "tabKeys"], // Autoshift a
  ])("keycode %i with %s open gives %s", (keyCode, currentTab, expected) => {
    expect(detectTab(keyCode, currentTab)).toBe(expected);
  });
});
