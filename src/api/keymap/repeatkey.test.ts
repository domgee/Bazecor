import { describe, expect, test, vi } from "vitest";
import { KeymapDB } from ".";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("KeymapDB Repeat key", () => {
  test("the Repeat key reads as REPEAT on its own", () => {
    const db = new KeymapDB();

    const key = db.parse(53594);

    expect({ label: key.label, extraLabel: key.extraLabel, verbose: key.verbose }).toEqual({
      label: "REPEAT",
      extraLabel: undefined,
      verbose: "Repeat last key",
    });
  });

  test("keySegmentor keeps the Repeat key whole", () => {
    const db = new KeymapDB();

    // Keep it from splitting into Num 2 plus modifier flags
    expect(db.keySegmentor(53594)).toEqual({ base: 53594, modified: 0 });
  });
});
