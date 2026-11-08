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

    // Shift+- is "_" with alt set, so the hold entry must carry alt over
    const shiftMinus = db.parse(0x282d);

    expect({ label: shiftMinus.label, extraLabel: shiftMinus.extraLabel, alt: shiftMinus.alt }).toEqual({
      label: "_",
      extraLabel: "HOLD",
      alt: true,
    });
  });

  test("keySegmentor splits a hold key into its key and the modifier byte", () => {
    const db = new KeymapDB();

    expect(db.keySegmentor(0x302b)).toEqual({ base: 0x2b, modified: 0x3000 });
    expect(db.keySegmentor(0x102b)).toEqual({ base: 0x2b, modified: 0x1000 });
  });

  test.each([
    [0x982b], // Slot 0
    [0xb82b], // Slot 1
  ])("a partial hold %i reads as its key with a HOLD marker", keyCode => {
    const db = new KeymapDB();

    const parsed = db.parse(keyCode);

    expect({ keyCode: parsed.keyCode, label: parsed.label, extraLabel: parsed.extraLabel }).toEqual({
      keyCode,
      label: "TAB",
      extraLabel: "HOLD",
    });
  });

  test("keySegmentor splits a partial hold into its key and the high byte", () => {
    const db = new KeymapDB();

    expect(db.keySegmentor(0x982b)).toEqual({ base: 0x2b, modified: 0x9800 });
    expect(db.keySegmentor(0xb82b)).toEqual({ base: 0x2b, modified: 0xb800 });
  });

  test("a partial code the firmware rejects stays a raw code", () => {
    const db = new KeymapDB();

    // Cmd+Tab has a single modifier
    expect(db.parse(0x902b).label).toBe(`#${0x902b}`);
  });
});
