import React from "react";
import { createHash } from "crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { KeyboardModel } from "../shared/types";
import { KeyboardView } from "./KeyboardView";

// Superkey 1, macro 1, a layer shift key, OS+Tab, a media key, A, Left Shift, Superkey 2, Numpad 7 and a dual function key
const FILL = [53980, 53852, 17450, 4139, 22733, 4, 225, 53981, 95, 51222];
const SUPERKEY_1 = 53980;

// Keys drawn from their own silhouette path, so the Superkey label is rendered on every shape
const SILHOUETTE_KEYS: Record<string, number[]> = {
  Sonsei: [48, 49, 50, 51, 56, 57, 58, 59],
  Defy: Array.from({ length: 16 }, (_, i) => 64 + i),
  Raise2: [69, 73],
};
const RAISE2_ISO_ENTER = 31;

const createModel = (product: string, keyboardType?: string): KeyboardModel => {
  const keysPerLayer = product === "Sonsei" ? 60 : 80;
  const layer = Array.from({ length: keysPerLayer }, (_, i) => FILL[i % FILL.length]);

  for (const index of SILHOUETTE_KEYS[product]) {
    layer[index] = SUPERKEY_1;
  }

  if (keyboardType === "ISO") {
    layer[RAISE2_ISO_ENTER] = SUPERKEY_1;
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
      `"76a2e1b092f4af85952704b5fddd2d40793a87dc7d213d22617190b73dab8ceb"`,
    );
  });

  test("Defy", () => {
    expect(sha(render(createModel("Defy")))).toMatchInlineSnapshot(
      `"3930f2175567fb16a0f070e6423210933c400f5305605747635efbe4d6a54bf2"`,
    );
  });

  test("Raise2 ANSI", () => {
    expect(sha(render(createModel("Raise2", "ANSI")))).toMatchInlineSnapshot(
      `"18ead85913457895ae68589fec15fc1827ad0ed62ef3689e60c7957d8a083286"`,
    );
  });

  test("Raise2 ISO", () => {
    expect(sha(render(createModel("Raise2", "ISO")))).toMatchInlineSnapshot(
      `"5f99106f5af3e5487897300c0210f79d6dbc9791e02f577cb9c6d20931352885"`,
    );
  });
});
