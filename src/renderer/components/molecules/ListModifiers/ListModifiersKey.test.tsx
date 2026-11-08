import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ListModifiersKey from "./ListModifiersKey";
import ListModifier from "./ListModifiers";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("modifier chips of hold until layer change keys", () => {
  afterEach(() => {
    cleanup();
  });

  test.each([
    [0x302b, 1], // Cmd+Tab hold
    [0x382b, 2], // Cmd+Shift+Tab hold
    [0x982b, 2], // Cmd+Shift+Tab partial hold
    [0xb82b, 2], // Cmd+Shift+Tab partial hold, slot 1
    [0x2b, 0], // Tab
  ])("ListModifiersKey draws %i with %i chips", (keyCode, expected) => {
    const { container } = render(<ListModifiersKey keyCode={keyCode} selectedKey={undefined} />);

    expect(container.querySelectorAll("li")).toHaveLength(expected);
  });

  test("ListModifiers draws a hold key's modifier", () => {
    const { container } = render(<ListModifier keyCode={0x302b} />);

    expect(container.querySelector(".listModifiersTags")?.childElementCount).toBe(1);
  });

  test("ListModifiers draws a partial hold's modifiers", () => {
    const { container } = render(<ListModifier keyCode={0x982b} />);

    expect(container.querySelector(".listModifiersTags")?.childElementCount).toBe(2);
  });
});
