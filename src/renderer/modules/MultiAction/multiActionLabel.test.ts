import { describe, expect, test, vi } from "vitest";
import { keyFaceSlots, labelContext, superkeyFace, superkeyName, withGeneratedNames } from "./multiActionLabel";
import { dualUseCodeFor } from "../../../api/parsers/altRepeat";

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

describe("keyFaceSlots", () => {
  const SUPERKEY_1 = 53980;
  const CTRL = 224;
  // Layer 2 shift, the hold of a dual-function layer key
  const LAYER_2 = 17451;

  test("SuperkeyWithFiveActions_EverySlotInLensOrder", () => {
    const slots = keyFaceSlots(SUPERKEY_1, [{ actions: [A, GUI, B, 6, 7] }], ctx);

    // Tap, hold, tap and hold, double tap, double tap and hold
    expect(slots).toEqual([{ text: "A" }, { text: "⌘" }, { text: "B" }, { text: "C" }, { text: "D" }]);
  });

  test("SuperkeyWithTapAndHold_OtherSlotsEmpty", () => {
    expect(keyFaceSlots(SUPERKEY_1 + 1, [{ actions: [1, 1, 1, 1, 1] }, { actions: [A, GUI] }], ctx)).toEqual([
      { text: "A" },
      { text: "⌘" },
      null,
      null,
      null,
    ]);
  });

  test("DualFunctionModifierKey_TapCentreAndHoldTopRight", () => {
    expect(keyFaceSlots(dualUseCodeFor(A, CTRL) as number, [], ctx)).toEqual([{ text: "A" }, { text: "⌃" }, null, null, null]);
  });

  test("DualFunctionLayerKey_HoldWithLayerIcon", () => {
    expect(keyFaceSlots(dualUseCodeFor(A, LAYER_2) as number, [], ctx)).toEqual([
      { text: "A" },
      { text: "2", holdIcon: "shift" },
      null,
      null,
      null,
    ]);
  });

  test.each([
    [A, [{ actions: [A, GUI] }]], // plain key
    [SUPERKEY_1, [{ actions: [1, 1, 1, 1, 1] }]], // idle Superkey
    [SUPERKEY_1, []], // undefined Superkey
    [SUPERKEY_1 + 70, [{ actions: [A, GUI] }]], // Superkey beyond the limit
  ])("key %i with table %j has no slots", (code, table) => {
    expect(keyFaceSlots(code, table, ctx)).toBeNull();
  });

  test("EditedTable_SlotsFollowTheDraft", () => {
    const before = keyFaceSlots(SUPERKEY_1, [{ actions: [A, GUI] }], ctx);
    const after = keyFaceSlots(SUPERKEY_1, [{ actions: [B, GUI] }], ctx);

    expect([before?.[0], after?.[0]]).toEqual([{ text: "A" }, { text: "B" }]);
  });
});
