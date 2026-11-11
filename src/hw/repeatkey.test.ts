import { describe, expect, test } from "vitest";
import { hasRepeatKeyMarker, isRepeatKey } from "./repeatkey";

describe("repeatkey", () => {
  test.each([
    [53593, false], // One below
    [53594, true], // Repeat key
    [53595, false], // One above
  ])("isRepeatKey(%i) is %s", (keyCode, expected) => {
    expect(isRepeatKey(keyCode)).toBe(expected);
  });

  test.each([
    ["help\r\nrepeatkey.state\r\nversion", true],
    ["repeatkey.stateX", false],
    ["altrepeat.map", false],
    [undefined, false],
    ["", false],
  ])("hasRepeatKeyMarker(%j) is %s", (help, expected) => {
    expect(hasRepeatKeyMarker(help)).toBe(expected);
  });
});
