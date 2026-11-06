import { describe, expect, test } from "vitest";
import { canSwapTap, hasSwapHandsMarker, isSwapHandsCode, isSwapTap, swapTapBase, toSwapTap } from "./swaphands";

describe("swaphands", () => {
  test.each([
    [54371, false], // CapsWord
    [54372, true], // Swap while held
    [54375, true], // One-shot
    [54376, true], // First tap code
    [54631, true], // Last tap code
    [54632, false], // SAFE_START
    [54115, false], // Autoshift a
  ])("isSwapHandsCode(%i) is %s", (keyCode, expected) => {
    expect(isSwapHandsCode(keyCode)).toBe(expected);
  });

  test.each([
    [54375, false], // One-shot
    [54376, true], // First tap code
    [54631, true], // Last tap code
    [54632, false], // SAFE_START
  ])("isSwapTap(%i) is %s", (keyCode, expected) => {
    expect(isSwapTap(keyCode)).toBe(expected);
  });

  test("toSwapTap and swapTapBase convert between a tap key and its swap key", () => {
    expect(toSwapTap(0x2c)).toBe(54420);
    expect(swapTapBase(54420)).toBe(0x2c);
  });

  test.each([
    [3, false], // Below a
    [4, true], // a
    [0x2c, true], // Space
    [0xdd, true], // Last HID key
    [0xde, false], // Past the last HID key
    [0xe1, false], // Left Shift
    [0x102c, false], // Cmd+Space
  ])("canSwapTap(%i) is %s", (keyCode, expected) => {
    expect(canSwapTap(keyCode)).toBe(expected);
  });

  test.each([
    ["help\r\nswaphands.state\r\nversion", true],
    ["swaphands.stateX", false],
    ["layerhold.state", false],
    [undefined, false],
    [42, false],
  ])("hasSwapHandsMarker(%j) is %s", (help, expected) => {
    expect(hasSwapHandsMarker(help)).toBe(expected);
  });
});
