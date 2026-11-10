import { describe, expect, test, vi } from "vitest";
import { labelContext, superkeyFace, superkeyName, withGeneratedNames } from "./multiActionLabel";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const A = 4;
const B = 5;
const GUI = 227;
const ctx = labelContext("us", [], [], "mac");

describe("superkeyName", () => {
  test("names a tap and hold as tap/hold", () => {
    expect(superkeyName([A, GUI, 1, 1, 1], ctx)).toBe("A/⌘");
  });

  test("names other Superkeys by their set actions with slot prefixes", () => {
    expect(superkeyName([A, 1, B, 1, GUI], ctx)).toBe("T:A TH:B 2TH:⌘");
  });

  test("caps a long name at 24 characters", () => {
    const name = superkeyName([40, 41, 42, 43, 44], ctx);

    expect([...name]).toHaveLength(24);
    expect(name.endsWith("…")).toBe(true);
  });

  test("gives an idle Superkey no name", () => {
    expect(superkeyName([1, 1, 1, 1, 1], ctx)).toBe("");
    expect(superkeyName(undefined, ctx)).toBe("");
  });
});

describe("superkeyFace", () => {
  test("shows the tap, or else the hold, cut to five characters", () => {
    expect(superkeyFace([A, GUI, 1, 1, 1], 0, ctx)).toBe("A");
    expect(superkeyFace([1, GUI, 1, 1, 1], 0, ctx)).toBe("⌘");
    expect([...superkeyFace([0x104, 0x1004, 1, 1, 1], 0, ctx)].length).toBeLessThanOrEqual(5);
  });

  test("shows SK<n> for an undefined, idle or beyond-limit slot", () => {
    expect(superkeyFace(undefined, 3, ctx)).toBe("SK4");
    expect(superkeyFace([1, 1, 1, 1, 1], 3, ctx)).toBe("SK4");
    expect(superkeyFace([A, GUI, 1, 1, 1], 75, ctx)).toBe("SK76");
  });
});

describe("withGeneratedNames", () => {
  test("numbers the rows and names them from their actions", () => {
    expect(withGeneratedNames([[A, GUI], [1]], ctx)).toEqual([
      { actions: [A, GUI, 1, 1, 1], name: "A/⌘", id: 0 },
      { actions: [1, 1, 1, 1, 1], name: "", id: 1 },
    ]);
  });
});
