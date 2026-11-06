import { describe, expect, test } from "vitest";
import { SuperkeysType } from "@Renderer/types/superkeys";

import { PerKeyOverride } from "../../../api/parsers/dualFunction";
import { SwapHandsCodes, toSwapTap } from "../../../hw/swaphands";
import {
  GLOBAL_CHOICE,
  HOLD_TIMEOUT_RANGE,
  PRIOR_INTERVAL_RANGE,
  QUICK_TAP_RANGE,
  clearOverride,
  emptyOverride,
  keyRole,
  modeChoice,
  modeFromChoice,
  overrideAt,
  sameOverrides,
  sliderBounds,
  startValue,
  triStateChoice,
  triStateFromChoice,
  updateOverride,
  withOverride,
} from "./overrideTable";

const withTimeout = (position: number, holdTimeout: number): PerKeyOverride => ({ ...emptyOverride(position), holdTimeout });

const superkey = (actions: number[]): SuperkeysType => ({ actions, name: "", id: 0 }) as unknown as SuperkeysType;

describe("override list edits", () => {
  test("give an empty override for a key without one", () => {
    expect(overrideAt([withTimeout(3, 200)], 7)).toEqual(emptyOverride(7));
  });

  test("give the stored override for a key with one", () => {
    expect(overrideAt([withTimeout(3, 200)], 3)).toEqual(withTimeout(3, 200));
  });

  test("insert a new override in position order", () => {
    const list = updateOverride([withTimeout(3, 200), withTimeout(40, 300)], 12, { retro: true });

    expect(list).toEqual([withTimeout(3, 200), { ...emptyOverride(12), retro: true }, withTimeout(40, 300)]);
  });

  test("merge a patch into an existing override", () => {
    const list = updateOverride([withTimeout(3, 200)], 3, { mode: 1, chordal: false });

    expect(list).toEqual([{ ...withTimeout(3, 200), mode: 1, chordal: false }]);
  });

  test("drop an override whose last field goes back to global", () => {
    expect(updateOverride([withTimeout(3, 200), withTimeout(5, 250)], 3, { holdTimeout: null })).toEqual([withTimeout(5, 250)]);
  });

  test("leave the input list unchanged", () => {
    const list = [withTimeout(3, 200)];

    updateOverride(list, 3, { holdTimeout: 400 });
    updateOverride(list, 9, { retro: false });

    expect(list).toEqual([withTimeout(3, 200)]);
  });

  test("ignore the position inside a patch", () => {
    const patch = { position: 9, holdTimeout: 300 } as unknown as Partial<PerKeyOverride>;

    expect(updateOverride([], 3, patch)).toEqual([withTimeout(3, 300)]);
  });

  test("never store an empty override", () => {
    expect(withOverride([withTimeout(3, 200)], emptyOverride(9))).toEqual([withTimeout(3, 200)]);
  });

  test("clear one key and keep the others", () => {
    expect(clearOverride([withTimeout(3, 200), withTimeout(5, 250)], 3)).toEqual([withTimeout(5, 250)]);
  });

  test("compare lists by what the keyboard would store", () => {
    expect(sameOverrides([withTimeout(5, 250), withTimeout(3, 200)], [withTimeout(3, 200), withTimeout(5, 250)])).toBe(true);
    expect(sameOverrides([withTimeout(3, 200)], [withTimeout(3, 205)])).toBe(false);
    expect(sameOverrides([emptyOverride(3)], [])).toBe(true);
  });
});

describe("select values", () => {
  test.each([
    [null, GLOBAL_CHOICE],
    [true, "on"],
    [false, "off"],
  ])("map the on/off field %s to %s and back", (value, choice) => {
    expect(triStateChoice(value)).toBe(choice);
    expect(triStateFromChoice(choice)).toBe(value);
  });

  test("reject an on/off value the select does not offer", () => {
    expect(triStateFromChoice("maybe")).toBeUndefined();
  });

  test.each([
    [null, GLOBAL_CHOICE],
    [0, "0"],
    [1, "1"],
    [2, "2"],
  ])("map the mode %s to %s and back", (mode, choice) => {
    expect(modeChoice(mode)).toBe(choice);
    expect(modeFromChoice(choice)).toBe(mode);
  });

  test.each(["3", "", "x"])("reject the mode value %j", choice => {
    expect(modeFromChoice(choice)).toBeUndefined();
  });
});

describe("numeric fields", () => {
  test("start at the global value", () => {
    expect(startValue(300, HOLD_TIMEOUT_RANGE)).toBe(300);
    expect(startValue(0, QUICK_TAP_RANGE)).toBe(0);
  });

  test("clamp a global value outside the page's range", () => {
    expect(startValue(65534, HOLD_TIMEOUT_RANGE)).toBe(1000);
    expect(startValue(10, HOLD_TIMEOUT_RANGE)).toBe(50);
    expect(startValue(900, QUICK_TAP_RANGE)).toBe(500);
    expect(startValue(255, PRIOR_INTERVAL_RANGE)).toBe(254);
  });

  test("start at the fallback when the global value is unknown", () => {
    expect(startValue(null, HOLD_TIMEOUT_RANGE)).toBe(250);
    expect(startValue(-1, QUICK_TAP_RANGE)).toBe(0);
    expect(startValue(null, PRIOR_INTERVAL_RANGE)).toBe(75);
  });

  test("keep the slider at the page's range for a value inside it", () => {
    expect(sliderBounds(300, HOLD_TIMEOUT_RANGE)).toEqual({ min: 50, max: 1000 });
  });

  test("widen the slider for a stored value outside the page's range", () => {
    expect(sliderBounds(2000, HOLD_TIMEOUT_RANGE)).toEqual({ min: 50, max: 2000 });
    expect(sliderBounds(1, HOLD_TIMEOUT_RANGE)).toEqual({ min: 1, max: 1000 });
    expect(sliderBounds(1000, QUICK_TAP_RANGE)).toEqual({ min: 0, max: 1000 });
  });

  test("keep the slider at the page's range for a field the keyboard holds on global", () => {
    expect(sliderBounds(null, HOLD_TIMEOUT_RANGE)).toEqual({ min: 50, max: 1000 });
  });

  test("keep widened bounds while a stored value is dragged back inside the page's range", () => {
    const stored = updateOverride([], 3, { holdTimeout: 2000 });
    const edited = updateOverride(stored, 3, { holdTimeout: 400 });

    // Take the bounds from the stored list, as the panel does, so the edit leaves them alone
    expect(sliderBounds(overrideAt(stored, 3).holdTimeout, HOLD_TIMEOUT_RANGE)).toEqual({ min: 50, max: 2000 });
    expect(overrideAt(edited, 3).holdTimeout).toBe(400);
  });
});

describe("key roles", () => {
  test.each([
    [49169, "dualFunction"], // first DUM code
    [53266, "dualFunction"], // last DUL code
    [toSwapTap(0x2c), "swapHands"], // swap on hold, Space on tap
    [SwapHandsCodes.SWAP_HANDS_TAP_TOGGLE, "swapHands"],
    [SwapHandsCodes.SWAP_HANDS_MON, "other"],
    [4, "other"], // A
    [65535, "other"], // transparent
    [undefined, "other"],
  ])("give %s the role %s", (keyCode, role) => {
    expect(keyRole(keyCode)).toBe(role);
  });

  test("treat a TAP + modifier HOLD superkey as a dual-function key", () => {
    // Superkey 0 holds A on tap and Left Shift on hold
    expect(keyRole(53980, [superkey([4, 225, 1, 1, 1])])).toBe("dualFunction");
  });

  test("treat a superkey with more actions as another key", () => {
    // Superkey 0 adds a double tap
    expect(keyRole(53980, [superkey([4, 225, 5, 1, 1])])).toBe("other");
  });

  test("treat an unknown superkey as another key", () => {
    expect(keyRole(53981, [superkey([4, 225, 1, 1, 1])])).toBe("other");
  });
});
