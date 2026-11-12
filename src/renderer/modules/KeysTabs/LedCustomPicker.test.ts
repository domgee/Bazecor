import { describe, expect, test, vi } from "vitest";
import { withType } from "./LedCustomPicker";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("withType", () => {
  test("starts Solid from white when the previous type had no colour", () => {
    expect(withType({ type: 6, r: 0, g: 0, b: 0, speed: 0 }, 1)).toEqual({ type: 1, r: 255, g: 255, b: 255, speed: 0 });
  });

  test("keeps the colour of a Solid draft", () => {
    expect(withType({ type: 1, r: 10, g: 20, b: 30, speed: 0 }, 1)).toEqual({ type: 1, r: 10, g: 20, b: 30, speed: 0 });
  });

  test("starts Rainbow at the built-in speed", () => {
    expect(withType({ type: 1, r: 10, g: 20, b: 30, speed: 0 }, 2).speed).toBe(40);
  });
});
