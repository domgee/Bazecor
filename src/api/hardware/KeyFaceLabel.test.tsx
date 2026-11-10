import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import Styled, { ThemeProvider } from "styled-components";
import Light from "@Renderer/theme/LightTheme";
import { keyboardCanvasStyles } from "@Renderer/modules/KeyboardCanvas/keyboardCanvasStyles";
import KeyFaceLabel from "./KeyFaceLabel";
import Key from "./Key";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

afterEach(cleanup);

const renderFace = (props: Partial<React.ComponentProps<typeof KeyFaceLabel>>) =>
  render(
    <svg>
      <KeyFaceLabel x={4} y={0} width={49} height={49} centerExtra="SUPER" centerPrimary="A" {...props} />
    </svg>,
  ).container;

const slotTexts = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-slot]")].map(slot => [slot.getAttribute("data-slot"), slot.textContent]);

describe("KeyFaceLabel", () => {
  test("NoSlots_PlainLabel", () => {
    const container = renderFace({});

    expect(container.querySelector(".labelClass")?.textContent).toBe("A");
    expect(container.querySelector(".extraLabel")?.textContent).toBe("SUPER");
    expect(container.querySelector("[data-slot]")).toBeNull();
  });

  test("FiveSlots_DrawnInLensPositionsInsideTheBadgeHost", () => {
    const container = renderFace({ slots: [{ text: "A" }, { text: "⌘" }, { text: "B" }, { text: "C" }, { text: "D" }] });

    expect(slotTexts(container)).toEqual([
      ["tap", "A"],
      ["hold", "⌘"],
      ["tapHold", "B"],
      ["dTap", "C"],
      ["dTapHold", "D"],
    ]);
    // Keep the label div, since the combo and previous-key badges hang off it
    expect(container.querySelector(".keyContentLabel .keyContentSlots")).not.toBeNull();
    expect(container.querySelector(".labelClass")).toBeNull();
  });

  test("DualFunctionSlots_TapAndHoldOnly", () => {
    const container = renderFace({ slots: [{ text: "A" }, { text: "⌃" }, null, null, null] });

    expect(slotTexts(container)).toEqual([
      ["tap", "A"],
      ["hold", "⌃"],
    ]);
  });

  test("Slots_TapCentredAndHoldTopRight", () => {
    const container = renderFace({ slots: [{ text: "A" }, { text: "⌃" }, null, null, null] });
    const tap = container.querySelector('[data-slot="tap"] text');
    const hold = container.querySelector('[data-slot="hold"] text');

    // Centre the tap at x 24.5 and anchor the hold at the right edge minus the Lens inset of 3
    expect([tap?.getAttribute("x"), tap?.getAttribute("text-anchor")]).toEqual(["24.5", "middle"]);
    expect([hold?.getAttribute("x"), hold?.getAttribute("text-anchor")]).toEqual(["46", "end"]);
    expect(Number(hold?.getAttribute("y"))).toBeLessThan(Number(tap?.getAttribute("y")));
  });

  test("Silhouette_SlotsKeptWithinTheLensThumbWidth", () => {
    const container = renderFace({ width: 80, slots: [{ text: "A" }, { text: "⌃" }, null, null, null], silhouette: true });
    const hold = container.querySelector('[data-slot="hold"] text');

    // Place the hold at the centre plus the Lens silhouette half width 22 minus the inset 3
    expect(hold?.getAttribute("x")).toBe("59");
  });
});

describe("Key", () => {
  const renderKey = (keyType: string, faceSlots: unknown, width = 57) =>
    render(
      <svg>
        <Key
          keyType={keyType}
          id="R0C0_keyshape"
          onClick={() => undefined}
          fill="#fff"
          stroke="#000"
          width={width}
          height={57}
          x={0}
          y={0}
          dataLedIndex={0}
          dataKeyIndex={0}
          dataLayer={0}
          centerPrimary={false}
          centerExtra={false}
          selectedKey={{ keyCode: 49173, label: "A", faceSlots }}
          keyCode={49173}
        />
      </svg>,
    ).container;

  test.each([
    ["regularKey", 57],
    ["sonsei-t1", 57],
    ["defy-t1", 57],
    ["t5", 123], // Raise space key, as wide as on the board
    ["enterKey", 57],
  ])("%s with slots draws them", (keyType, width) => {
    const container = renderKey(keyType as string, [{ text: "A" }, { text: "⌃" }, null, null, null], width as number);

    expect(slotTexts(container)).toEqual([
      ["tap", "A"],
      ["hold", "⌃"],
    ]);
  });

  test("PlainKey_NoSlots", () => {
    const container = renderKey("regularKey", undefined);

    expect(container.querySelector("[data-slot]")).toBeNull();
    expect(container.querySelector(".labelClass")).not.toBeNull();
  });
});

describe("KeyFaceLabel with the editor styles", () => {
  const Canvas = Styled.div`
    ${keyboardCanvasStyles}
  `;

  test("SlotIcon_KeepsItsOwnSizeWhileTheBoardFillsTheWidth", () => {
    // Use the play-pause icon on the tap, which superkeySlots draws as a nested svg
    const { container } = render(
      <ThemeProvider theme={Light}>
        <Canvas>
          <div className="singleViewMode keyboard">
            <div className="LayerHolder">
              <div className="raiseKeyboard">
                <svg className="board">
                  <KeyFaceLabel x={4} y={0} width={49} height={49} centerExtra="" centerPrimary="" slots={[{ text: "", icon: "play-pause" }]} />
                </svg>
              </div>
            </div>
          </div>
        </Canvas>
      </ThemeProvider>,
    );
    const board = container.querySelector("svg.board") as SVGElement;
    const icon = container.querySelector('[data-slot="tap"] svg') as SVGElement;

    expect([getComputedStyle(board).width, getComputedStyle(board).height]).toEqual(["100%", "100%"]);
    expect(icon).not.toBeNull();
    expect([getComputedStyle(icon).width, getComputedStyle(icon).height]).not.toContain("100%");
  });
});
