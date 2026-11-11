import React from "react";
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { KeymapDB } from "../../../../api/keymap";
import KeyLabel from "./KeyLabel";

describe("KeyLabel", () => {
  afterEach(() => {
    cleanup();
  });

  test.each([
    [17451], // Shift to layer 2
    [49162], // OneShot layer 2
    [49154], // OneShot Left Shift
    [4], // a
    [12331], // Cmd+Tab hold until layer change
  ])("keycode %i renders a visible label", keyCode => {
    const keyData = new KeymapDB().parse(keyCode);

    const { container } = render(<KeyLabel keyData={keyData} />);

    expect(container.childElementCount).toBeGreaterThan(0);
  });

  test("the Repeat key renders its REPEAT label", () => {
    const keyData = new KeymapDB().parse(53594);

    const { container } = render(<KeyLabel keyData={keyData} />);

    expect(container.textContent).toContain("REPEAT");
  });
});
