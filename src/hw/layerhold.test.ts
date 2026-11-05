import { describe, expect, test } from "vitest";
import { canHoldUntilLayerChange, fromLayerHold, hasLayerHoldMarker, isLayerHold, keepLayerHold, toLayerHold } from "./layerhold";

describe("layerhold", () => {
  test.each([
    [8191, false], // Last plain shortcut
    [8192, true], // First hold code
    [16383, true], // Last hold code
    [16384, false], // Past the hold range
    [54115, false], // Autoshift a
  ])("isLayerHold(%i) is %s", (keyCode, expected) => {
    expect(isLayerHold(keyCode)).toBe(expected);
  });

  test("toLayerHold and fromLayerHold convert between a shortcut and its hold key", () => {
    expect(toLayerHold(0x102b)).toBe(0x302b);
    expect(fromLayerHold(0x302b)).toBe(0x102b);
  });

  test.each([
    [0x102b, true], // Cmd+Tab
    [0x080b, true], // Shift+H
    [0x10dd, true], // Cmd with the last HID key
    [0x2b, false], // Tab without a modifier
    [0x10de, false], // Past HID_LAST_KEY
    [0x10e3, false], // Cmd with a modifier keycode
    [0x302b, false], // Already a hold key
    [54115, false], // Autoshift a
    [17451, false], // Shift to layer 2
  ])("canHoldUntilLayerChange(%i) is %s", (keyCode, expected) => {
    expect(canHoldUntilLayerChange(keyCode)).toBe(expected);
  });

  test.each([
    [0x182b, true, 0x382b], // Held shortcut keeps the flag
    [0x2b, true, 0x2b], // No modifier left drops the flag
    [0x182b, false, 0x182b], // Not held stays plain
  ])("keepLayerHold(%i, %s) is %i", (keyCode, held, expected) => {
    expect(keepLayerHold(keyCode, held)).toBe(expected);
  });

  test.each([
    ["version\r\nlayerhold.state\r\nhelp", true], // Listed
    ["layerhold.stateX", false], // Another command
    ["", false], // Empty reply
    [undefined, false], // No reply
    [new Error(), false], // Failed request
  ])("hasLayerHoldMarker(%j) is %s", (help, expected) => {
    expect(hasLayerHoldMarker(help)).toBe(expected);
  });
});
