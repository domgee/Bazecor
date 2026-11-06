import { describe, expect, test, vi } from "vitest";
import { KeymapDB } from ".";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const labels = (db: KeymapDB, keyCode: number) => {
  const key = db.parse(keyCode);
  return { label: key.label, extraLabel: key.extraLabel, verbose: key.verbose };
};

describe("KeymapDB swap hands keys", () => {
  test("the control keys read with a SWAP marker", () => {
    const db = new KeymapDB();

    expect([54372, 54373, 54374, 54375].map(code => labels(db, code))).toEqual([
      { label: "HOLD", extraLabel: "SWAP", verbose: "Swap hands while held" },
      { label: "TOGG", extraLabel: "SWAP", verbose: "Swap hands toggle" },
      { label: "TT", extraLabel: "SWAP", verbose: "Swap hands tap-toggle" },
      { label: "ONE", extraLabel: "SWAP", verbose: "Swap hands one-shot" },
    ]);
  });

  test("a tap key reads as its tap key with a SWAP marker", () => {
    const db = new KeymapDB();

    const swapA = db.parse(54380);
    const swapSpace = db.parse(54420);

    expect({ label: swapA.label, extraLabel: swapA.extraLabel }).toEqual({ label: "A", extraLabel: "SWAP" });
    expect(swapA.verbose).toBe(`Swap hands, ${db.parse(4).verbose ?? db.parse(4).label} on tap`);
    expect({ label: swapSpace.label, extraLabel: swapSpace.extraLabel }).toEqual({ label: db.parse(0x2c).label, extraLabel: "SWAP" });
  });

  test("a tap code the firmware has but Bazecor does not offer stays a raw code", () => {
    const db = new KeymapDB();

    // Tap key 0, no key
    expect(db.parse(54376).label).toBe("#54376");
  });

  test("keySegmentor splits a tap key into its tap key and the range start", () => {
    const db = new KeymapDB();

    expect(db.keySegmentor(54420)).toEqual({ base: 0x2c, modified: 54376 });
    expect(db.keySegmentor(54372)).toEqual({ base: 54372, modified: 0 });
  });
});
