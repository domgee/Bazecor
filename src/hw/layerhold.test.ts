import { describe, expect, test } from "vitest";
import {
  canHoldUntilLayerChange,
  fromLayerHold,
  hasLayerHoldMarker,
  holdShortcut,
  holdSlot,
  isHoldCode,
  isLayerHold,
  isPartialHold,
  keepLayerHold,
  shortcutMods,
  toLayerHold,
  toPartialHold,
} from "./layerhold";

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

  test.each([
    [0x982b, true], // Cmd+Shift+Tab, slot 0
    [0xb82b, true], // Cmd+Shift+Tab, slot 1
    [0x902b, false], // Cmd+Tab has a single modifier
    [0x802b, false], // No modifier
    [0x98de, false], // Past HID_LAST_KEY
    [0x9803, false], // Below a
    [0xd82b, false], // SYNTHETIC set
    [0x382b, false], // Legacy hold
    [0x182b, false], // Plain shortcut
    [0x1982b, false], // Above 16 bits
  ])("isPartialHold(%i) is %s", (keyCode, expected) => {
    expect(isPartialHold(keyCode)).toBe(expected);
  });

  test.each([
    [0x982b, true], // Partial hold
    [0x382b, true], // Legacy hold
    [0x182b, false], // Plain shortcut
    [0x902b, false], // Partial shape with a single modifier
  ])("isHoldCode(%i) is %s", (keyCode, expected) => {
    expect(isHoldCode(keyCode)).toBe(expected);
  });

  test.each([
    [0x982b, 0x182b], // Partial hold, slot 0
    [0xb82b, 0x182b], // Partial hold, slot 1
    [0x382b, 0x182b], // Legacy hold
    [0x182b, 0x182b], // Plain shortcut
    [0x902b, 0x902b], // Not a partial hold
    [54115, 54115], // Autoshift a
  ])("holdShortcut(%i) is %i", (keyCode, expected) => {
    expect(holdShortcut(keyCode)).toBe(expected);
  });

  test("toPartialHold builds both slots and holdSlot reads them back", () => {
    expect(toPartialHold(0x182b, 0)).toBe(0x982b);
    expect(toPartialHold(0x182b, 1)).toBe(0xb82b);
    expect(holdSlot(0x982b)).toBe(0);
    expect(holdSlot(0xb82b)).toBe(1);
  });

  test("shortcutMods reads the modifier flags of every form", () => {
    expect([shortcutMods(0x182b), shortcutMods(0x382b), shortcutMods(0x982b), shortcutMods(0xb82b)]).toEqual([
      0x18, 0x18, 0x18, 0x18,
    ]);
  });
});
