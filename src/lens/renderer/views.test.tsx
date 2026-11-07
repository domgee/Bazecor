import React from "react";
import { createHash } from "crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { KeyboardModel } from "../shared/types";
import { KeyboardView } from "./KeyboardView";

// Superkey 1, macro 1, a layer shift key, OS+Tab, a media key, A, Left Shift, Superkey 2, Numpad 7 and a dual function key
const FILL = [53980, 53852, 17450, 4139, 22733, 4, 225, 53981, 95, 51222];
const SUPERKEY_1 = 53980;
const SUPERKEY_2 = 53981;
const MACRO_1 = 53852;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Put a named Superkey, an unnamed Superkey and a macro on the keys drawn from their own silhouette path, so each label is rendered on
// those shapes. Raise2 ANSI has only two such keys, so its unnamed Superkey sits on the ISO Enter only.
const SILHOUETTE_KEYS: Record<string, Record<number, number[]>> = {
  Sonsei: { [SUPERKEY_1]: [48, 49, 50, 51, 56, 57], [SUPERKEY_2]: [58], [MACRO_1]: [59] },
  Defy: { [SUPERKEY_1]: range(64, 77), [SUPERKEY_2]: [78], [MACRO_1]: [79] },
  Raise2: { [SUPERKEY_1]: [69], [MACRO_1]: [73] },
};
const RAISE2_ISO_ENTER = 31;

const createModel = (product: string, keyboardType?: string): KeyboardModel => {
  const keysPerLayer = product === "Sonsei" ? 60 : 80;
  const layer = Array.from({ length: keysPerLayer }, (_, i) => FILL[i % FILL.length]);

  for (const [code, indexes] of Object.entries(SILHOUETTE_KEYS[product])) {
    for (const index of indexes) {
      layer[index] = Number(code);
    }
  }

  if (keyboardType === "ISO") {
    layer[RAISE2_ISO_ENTER] = SUPERKEY_2;
  }

  return {
    product,
    keyboardType,
    keymap: [layer],
    palette: [{ r: 10, g: 20, b: 30, w: 0, rgb: "rgb(10,20,30)" }],
    colormap: [new Array<number>(200).fill(0)],
    defaultLayer: 0,
    // Keep Superkey 1's actions out of the fill, so a label drawn from them differs from every other key
    superkeys: [
      [5, 6, 7, 9, 10],
      [43, 1, 1, 1, 1],
    ],
    superkeyNames: ["Nav", ""],
    macroNames: ["Copy"],
    macros: [
      [
        { type: 6, keyCode: 227 },
        { type: 8, keyCode: 43 },
        { type: 7, keyCode: 227 },
      ],
    ],
    // Leave the names empty and pass no layerNames prop, so the caption falls back to "Layer 0"
    layerNames: [],
    combos: [{ positions: [0, 49, 51, 65, 69, 73, 31], layer: 0 }],
  };
};

const sha = (markup: string) => createHash("sha256").update(markup).digest("hex");

const render = (model: KeyboardModel) => renderToStaticMarkup(<KeyboardView model={model} activeLayer={0} layout="en-US" />);

// Record the overlay as drawn before the expand settings, so the views stay identical while the settings are off
describe("Lens views", () => {
  test("Sonsei", () => {
    expect(sha(render(createModel("Sonsei")))).toMatchInlineSnapshot(
      `"3c4ba68c41d82e0fcdae64a4d3ccc9ed9c9ffed130c0532e2b8d3d1846e456cb"`,
    );
  });

  test("Defy", () => {
    expect(sha(render(createModel("Defy")))).toMatchInlineSnapshot(
      `"abe0e627a0ca7736ffa0626e5c9fa781b2d1e6265e576dbbbf6dae23ca93482c"`,
    );
  });

  test("Raise2 ANSI", () => {
    expect(sha(render(createModel("Raise2", "ANSI")))).toMatchInlineSnapshot(
      `"2e909802c6c46471d55eeefaf9a578827e6903a6d16112a5a2be0f72c5c3bec2"`,
    );
  });

  test("Raise2 ISO", () => {
    expect(sha(render(createModel("Raise2", "ISO")))).toMatchInlineSnapshot(
      `"a18c32a35556715cbbb70c37a9c3e8b0e0e37a796eb15c42da4138e1b2bd2ed2"`,
    );
  });
});
