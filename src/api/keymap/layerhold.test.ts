import { describe, expect, test, vi } from "vitest";
import { KeymapDB } from ".";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("KeymapDB hold until layer change keys", () => {
  test("a hold key reads as its key with a HOLD marker", () => {
    const db = new KeymapDB();

    const cmdTab = db.parse(0x302b);
    const shiftH = db.parse(0x380b);

    expect({ label: cmdTab.label, extraLabel: cmdTab.extraLabel }).toEqual({ label: "TAB", extraLabel: "HOLD" });
    expect({ label: shiftH.label, extraLabel: shiftH.extraLabel }).toEqual({ label: "H", extraLabel: "HOLD" });
  });

  test("a hold code the firmware rejects stays a raw code", () => {
    const db = new KeymapDB();

    // No modifier, and Cmd with a modifier keycode
    expect(db.parse(8235).label).toBe("#8235");
    expect(db.parse(0x30e3).label).toBe("#12515");
  });

  test("a hold key keeps the shortcut's layout metadata", () => {
    const db = new KeymapDB();

    expect(db.parse(0x302b).alt).toBe(db.parse(0x102b).alt);
  });

  test("keySegmentor splits a hold key into its key and the modifier byte", () => {
    const db = new KeymapDB();

    expect(db.keySegmentor(0x302b)).toEqual({ base: 0x2b, modified: 0x3000 });
    expect(db.keySegmentor(0x102b)).toEqual({ base: 0x2b, modified: 0x1000 });
  });
});
