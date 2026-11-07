import { describe, expect, test, vi } from "vitest";
import type { LensSettings } from "../shared/types";
import { sanitizeLensSettings } from "./lens-settings";

// Keep electron-store out of the test, sanitizeLensSettings never reads it
vi.mock("../../main/managers/Store", () => ({
  default: { getStore: () => ({ get: (): undefined => undefined, set: (): void => {} }) },
}));

describe("sanitizeLensSettings", () => {
  test("NoSettings_ExpandFlagsOff", () => {
    const settings = sanitizeLensSettings({});

    expect({ expandSuperkeys: settings.expandSuperkeys, expandMacros: settings.expandMacros }).toEqual({
      expandSuperkeys: false,
      expandMacros: false,
    });
  });

  test("ExpandFlagsOn_KeptOn", () => {
    const settings = sanitizeLensSettings({ expandSuperkeys: true, expandMacros: true });

    expect({ expandSuperkeys: settings.expandSuperkeys, expandMacros: settings.expandMacros }).toEqual({
      expandSuperkeys: true,
      expandMacros: true,
    });
  });

  test.each([
    ["yes", "yes"],
    [1, 1],
  ])("ExpandFlagsNotBoolean %s_Off", (expandSuperkeys, expandMacros) => {
    // Simulate a hand-edited store with values of the wrong type
    const settings = sanitizeLensSettings({ expandSuperkeys, expandMacros } as unknown as Partial<LensSettings>);

    expect({ expandSuperkeys: settings.expandSuperkeys, expandMacros: settings.expandMacros }).toEqual({
      expandSuperkeys: false,
      expandMacros: false,
    });
  });
});
