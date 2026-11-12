import { describe, expect, test, vi } from "vitest";
import { KeymapDB } from ".";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("KeymapDB custom LED effect slots", () => {
  test("a slot key reads as LED over its slot number where the table is unknown", () => {
    const db = new KeymapDB();

    const key = db.parse(17157);

    expect({ label: key.label, extraLabel: key.extraLabel, verbose: key.verbose }).toEqual({
      label: "SLOT 3",
      extraLabel: "LED",
      verbose: "Custom effect 3",
    });
  });

  test("keySegmentor keeps every slot key whole", () => {
    const db = new KeymapDB();

    expect([17155, 17170].map(code => db.keySegmentor(code))).toEqual([
      { base: 17155, modified: 0 },
      { base: 17170, modified: 0 },
    ]);
  });
});
