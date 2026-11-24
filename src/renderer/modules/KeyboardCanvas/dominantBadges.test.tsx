import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SuperkeysType } from "@Renderer/types/superkeys";
import Key from "../../../api/hardware/Key";
import { dominantBadgeBaseStyles, dominantBadgeLabels, dominantBadgeStyles } from "./dominantBadges";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

afterEach(cleanup);

const LAYER_SHIFT_1 = 17451;
const A = 4;
const TRANSPARENT = 65535;
const SWAP_HANDS_MON = 54372;

// Put A on every position of layer 1 except 7, which holds a Layer Shift
const layerZero = Array.from({ length: 60 }, (_, position) => (position === 7 ? LAYER_SHIFT_1 : A));
// Make position 30 Transparent and position 31 a swap hands key on layer 2
const layerOne = Array.from({ length: 60 }, (_, position) => [A, TRANSPARENT, SWAP_HANDS_MON][Math.max(0, position - 29)] ?? A);
const view = { layer: 0, onlyCustom: true, layers: [layerZero, layerOne, layerOne, layerOne], superkeys: [] as SuperkeysType[] };

describe("dominant layer badges", () => {
  test("label each key with its layer as Bazecor numbers it", () => {
    expect(
      dominantBadgeLabels(
        [
          { position: 15, layer: 1 },
          { position: 20, layer: 3 },
        ],
        view,
      ),
    ).toEqual(
      new Map([
        [15, "L2"],
        [20, "L4"],
      ]),
    );
  });

  test("badge only layer 1 with custom layers only", () => {
    const list = [{ position: 15, layer: 1 }];

    expect(dominantBadgeLabels(list, { ...view, layer: 1 }).size).toBe(0);
    expect(dominantBadgeLabels(list, { ...view, onlyCustom: false }).size).toBe(0);
  });

  test("skip a cell that changes the layer", () => {
    expect(dominantBadgeLabels([{ position: 7, layer: 1 }], view).size).toBe(0);
  });

  test("skip an entry whose dominant-layer cell is Transparent or a swap hands key", () => {
    expect(
      dominantBadgeLabels(
        [
          { position: 29, layer: 1 },
          { position: 30, layer: 1 },
          { position: 31, layer: 1 },
        ],
        view,
      ),
    ).toEqual(new Map([[29, "L2"]]));
  });

  test("skip an entry whose dominant layer the keymap lacks", () => {
    expect(dominantBadgeLabels([{ position: 29, layer: 5 }], view).size).toBe(0);
  });

  test("style each key's badge span inside the scope", () => {
    expect(dominantBadgeStyles([{ position: 15, layer: 1 }], view, ".scope")).toBe(
      '.scope [data-key-index="15"] .keyFaceBadge::after { content: "L2"; }',
    );
  });

  test("place the badge on the right edge, centred vertically", () => {
    const span = dominantBadgeBaseStyles.slice(0, dominantBadgeBaseStyles.indexOf(".keyFaceBadge::after"));

    expect(span).toContain("top: 50%;");
    expect(span).toContain("right: -3px;");
    expect(span).not.toMatch(/\bbottom:/);
    expect(span).not.toMatch(/\bleft:/);
  });

  test("the badge and the modifier chips of a modified key share its key group", () => {
    // Render Cmd+S, which draws modifier chips along the bottom row
    const CMD_S = 4096 + 22;
    const { container } = render(
      <svg>
        <Key
          keyType="regularKey"
          id="R1C2_keyshape"
          onClick={() => undefined}
          fill="#fff"
          stroke="#000"
          width={57}
          height={57}
          x={0}
          y={0}
          dataLedIndex={15}
          dataKeyIndex={15}
          dataLayer={0}
          centerPrimary={false}
          centerExtra={false}
          selectedKey={{ keyCode: CMD_S, label: "S" }}
          keyCode={CMD_S}
        />
      </svg>,
    );
    const badge = container.querySelector(".keyFaceBadge");
    const modifiers = container.querySelector(".keyContentModifiers");

    expect(badge).not.toBeNull();
    expect(modifiers).not.toBeNull();
    expect(badge?.closest("[data-key-index]")).toBe(modifiers?.closest("[data-key-index]"));
    expect(badge?.closest("[data-key-index]")?.getAttribute("data-key-index")).toBe("15");
  });
});
