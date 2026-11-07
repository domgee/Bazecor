import React from "react";
import { createHash } from "crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { render as renderDom } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { KeyboardModel, LensCombo } from "../shared/types";
import { KeyboardView } from "./KeyboardView";
import { SONSEI_KEYS } from "./geometry-sonsei";

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
    combos: [{ positions: [0, 49, 51, 65, 69, 73, 31], layer: 0, action: 41 }],
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

describe("Lens views with the expand settings off", () => {
  test.each([
    ["Sonsei", undefined],
    ["Defy", undefined],
    ["Raise2", "ANSI"],
    ["Raise2", "ISO"],
  ])("ExplicitlyOff_SameAsOmitted %s %s", (product, keyboardType) => {
    const model = createModel(product, keyboardType);

    const markup = renderToStaticMarkup(
      <KeyboardView
        model={model}
        activeLayer={0}
        layout="en-US"
        expandSuperkeys={false}
        expandMacros={false}
        expandCombos={false}
      />,
    );

    expect(sha(markup)).toBe(sha(render(model)));
  });
});

const SUPERKEY_1_ACTIONS = [5, 6, 7, 9, 10];
const COMBO_BADGE = 'rect[fill="#6b46f5"]';

// Fill every key with A except `keys`, which maps a key index to its code
const createExpandModel = (product: string, keys: Record<number, number>, comboKeys: number[], keyboardType?: string) => {
  const layer = new Array<number>(product === "Sonsei" ? 60 : 80).fill(4);

  Object.entries(keys).forEach(([index, code]) => {
    layer[Number(index)] = code;
  });

  const model: KeyboardModel = {
    ...createModel(product, keyboardType),
    keymap: [layer],
    superkeys: [SUPERKEY_1_ACTIONS],
    combos: comboKeys.length > 0 ? [{ positions: comboKeys, layer: 0, action: 6 }] : [],
  };
  return model;
};

const renderExpanded = (model: KeyboardModel, expandSuperkeys: boolean, expandMacros: boolean, expandCombos = false) =>
  renderDom(
    <KeyboardView
      model={model}
      activeLayer={0}
      layout="en-US"
      expandSuperkeys={expandSuperkeys}
      expandMacros={expandMacros}
      expandCombos={expandCombos}
    />,
  ).container;

const sonseiKey = (index: number) => {
  const key = SONSEI_KEYS.find(k => k.index === index);

  if (!key) {
    throw new Error(`No Sonsei key ${index}`);
  }

  return key;
};

const numberAttr = (element: Element | null | undefined, name: string) => Number(element?.getAttribute(name));

describe("Lens views with the expand settings on", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Macintosh");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("SonseiSuperkeyOnRectAndThumb_SlotsAndLiftedThumbBadge", () => {
    const key0 = sonseiKey(0);
    const key49 = sonseiKey(49);
    const model = createExpandModel("Sonsei", { 0: SUPERKEY_1, 49: SUPERKEY_1 }, [0, 49]);

    const container = renderExpanded(model, true, false);

    const tapTexts = [...container.querySelectorAll('g[data-slot="tap"] text')].map(t => t.textContent);
    const thumb = container.querySelector(`g[transform="translate(${key49.x},${key49.y})"]`);
    const rectBadge = [...container.querySelectorAll(COMBO_BADGE)].find(badge => !thumb?.contains(badge));
    expect(tapTexts).toEqual(["B", "B"]);
    // The thumb label centre is at y 27.9, and the badge sits 22 above it plus the lift of 6
    expect(numberAttr(thumb?.querySelector(COMBO_BADGE), "y")).toBeCloseTo(27.9 - 28);
    expect(numberAttr(rectBadge, "y")).toBeCloseTo(key0.y - 3);
  });

  test("DefyRotatedThumbSuperkey_SlotsTurnWithTheKey", () => {
    // Key 67 is the defy-t4 thumb, turned 37 degrees about its slot centre (36, 40)
    const container = renderExpanded(createExpandModel("Defy", { 67: SUPERKEY_1 }, []), true, false);

    const tap = container.querySelector('g[data-slot="tap"]');

    expect(tap?.parentElement?.getAttribute("transform")).toBe("rotate(37,36,40)");
  });

  test("Raise2AnsiWideSuperkey_HoldSlotAtTheRightEdge", () => {
    // Key 63 is the wide right Shift at x 987, 151 wide
    const container = renderExpanded(createExpandModel("Raise2", { 63: SUPERKEY_1 }, [], "ANSI"), true, false);

    const hold = container.querySelector('g[data-slot="hold"] text');

    expect({ x: hold?.getAttribute("x"), anchor: hold?.getAttribute("text-anchor") }).toEqual({ x: "1131", anchor: "end" });
  });

  test("Raise2IsoEnterSuperkey_SlotsInTheUpperRect", () => {
    const container = renderExpanded(createExpandModel("Raise2", { 31: SUPERKEY_1 }, [31], "ISO"), true, false);

    const positions = [...container.querySelectorAll("g[data-slot] text")].map(t => [numberAttr(t, "x"), numberAttr(t, "y")]);
    const outside = positions.filter(([x, y]) => x < 4 || x > 65 || y < 0 || y > 51);
    expect(positions).toHaveLength(5);
    expect(outside).toEqual([]);
    expect(numberAttr(container.querySelector(COMBO_BADGE), "y")).toBeCloseTo(24.5 - 28);
  });

  test("OnlyExpandSuperkeys_MacroKeepsItsName", () => {
    const container = renderExpanded(createExpandModel("Sonsei", { 0: SUPERKEY_1, 1: MACRO_1 }, []), true, false);

    expect(container.textContent).toContain("Copy");
    expect(container.textContent).not.toContain("⌘TAB");
  });

  test("OnlyExpandMacros_SuperkeyCollapsedAndMacroKeys", () => {
    const container = renderExpanded(createExpandModel("Sonsei", { 0: SUPERKEY_1, 1: MACRO_1 }, []), false, true);

    expect(container.querySelector("g[data-slot]")).toBeNull();
    expect(container.textContent).toContain("SUPER");
    expect(container.textContent).toContain("⌘TAB");
  });
});

const OS_C = 4102;
const ESCAPE = 41;

const combosOn = (positions: number[], ...actions: number[]): LensCombo[] =>
  actions.map(action => ({ positions, layer: 0, action }));

const badgeTexts = (container: Element) => [...container.querySelectorAll(`${COMBO_BADGE} + text`)].map(t => t.textContent);

describe("Lens views with Expand combos on", () => {
  beforeEach(() => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Macintosh");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("OneComboOnRectKey_OutputOnTheBadge", () => {
    const model = { ...createExpandModel("Sonsei", {}, []), combos: combosOn([0], OS_C) };

    const container = renderExpanded(model, false, false, true);

    expect(badgeTexts(container)).toEqual(["⌘C"]);
  });

  test("TwoCombosOnRectKey_TwoStackedBadges", () => {
    const key0 = sonseiKey(0);
    const model = { ...createExpandModel("Sonsei", {}, []), combos: combosOn([0], OS_C, ESCAPE) };

    const container = renderExpanded(model, false, false, true);

    const badgeYs = [...container.querySelectorAll(COMBO_BADGE)].map(badge => numberAttr(badge, "y"));
    expect(badgeTexts(container)).toEqual(["⌘C", "ESC"]);
    // Each badge is 12 high with a gap of 1
    expect(badgeYs).toEqual([key0.y - 3, key0.y - 3 + 13]);
  });

  test("ThreeCombosOnRectKey_SecondBadgeCountsTheRest", () => {
    const model = { ...createExpandModel("Sonsei", {}, []), combos: combosOn([0], OS_C, ESCAPE, 4) };

    const container = renderExpanded(model, false, false, true);

    expect(badgeTexts(container)).toEqual(["⌘C", "+2"]);
  });

  test("ExpandedSuperkeyInTwoCombos_OneBadgeWithCount", () => {
    const model = { ...createExpandModel("Sonsei", { 0: SUPERKEY_1 }, []), combos: combosOn([0], OS_C, ESCAPE) };

    const container = renderExpanded(model, true, false, true);

    expect(badgeTexts(container)).toEqual(["⌘C +1"]);
  });

  test("LongOutput_CutToTheFace", () => {
    const key0 = sonseiKey(0);
    const model = {
      ...createExpandModel("Sonsei", {}, []),
      macroNames: ["Copy everything to the clipboard"],
      combos: combosOn([0], MACRO_1),
    };

    const container = renderExpanded(model, false, false, true);

    const [text] = badgeTexts(container);
    const badgeWidth = numberAttr(container.querySelector(COMBO_BADGE), "width");
    expect(text?.endsWith("…")).toBe(true);
    // The text may take the face width less 8, and the badge adds 6 around it
    expect(badgeWidth).toBeLessThanOrEqual(key0.w - 8 - 8 + 6);
  });

  test("ExpandedMacroOutput_ItsKeys", () => {
    const model = { ...createExpandModel("Sonsei", {}, []), combos: combosOn([0], MACRO_1) };

    const container = renderExpanded(model, false, true, true);

    expect(badgeTexts(container)).toEqual(["⌘TAB"]);
  });

  test("SonseiThumb_OutputOnTheBadge", () => {
    const key49 = sonseiKey(49);
    const model = { ...createExpandModel("Sonsei", {}, []), combos: combosOn([49], ESCAPE) };

    const container = renderExpanded(model, false, false, true);

    const thumb = container.querySelector(`g[transform="translate(${key49.x},${key49.y})"]`);
    expect(badgeTexts(thumb ?? container)).toEqual(["ESC"]);
  });

  test("DefyRotatedThumb_BadgeTurnsWithTheKey", () => {
    // Key 67 is the defy-t4 thumb, turned 37 degrees
    const model = { ...createExpandModel("Defy", {}, []), combos: combosOn([67], ESCAPE, OS_C) };

    const container = renderExpanded(model, false, false, true);

    const turns = [...container.querySelectorAll(COMBO_BADGE)].map(badge => badge.parentElement?.getAttribute("transform"));
    expect(badgeTexts(container)).toEqual(["ESC", "⌘C"]);
    expect(turns.every(turn => turn?.startsWith("rotate(37,"))).toBe(true);
  });

  test("Raise2IsoEnter_OutputOnTheBadge", () => {
    const model = { ...createExpandModel("Raise2", {}, [], "ISO"), combos: combosOn([31], ESCAPE) };

    const container = renderExpanded(model, false, false, true);

    expect(badgeTexts(container)).toEqual(["ESC"]);
  });

  test("ExpandedSuperkeyOnThumb_OneLiftedBadge", () => {
    const key49 = sonseiKey(49);
    const model = { ...createExpandModel("Sonsei", { 49: SUPERKEY_1 }, []), combos: combosOn([49], ESCAPE, OS_C) };

    const container = renderExpanded(model, true, false, true);

    const thumb = container.querySelector(`g[transform="translate(${key49.x},${key49.y})"]`);
    expect(badgeTexts(container)).toEqual(["ESC +1"]);
    // The thumb label centre is at y 27.9, and the badge sits 22 above it plus the lift of 6
    expect(numberAttr(thumb?.querySelector(COMBO_BADGE), "y")).toBeCloseTo(27.9 - 28);
  });

  test("OnlyExpandCombos_SuperkeysAndMacrosAsBefore", () => {
    const model = { ...createExpandModel("Sonsei", { 0: SUPERKEY_1, 1: MACRO_1 }, []), combos: combosOn([0, 1], ESCAPE) };
    const withoutBadges = (container: HTMLElement) => {
      container.querySelectorAll(COMBO_BADGE).forEach(badge => badge.parentElement?.remove());
      return container.innerHTML;
    };

    const expanded = renderExpanded(model, false, false, true);
    const collapsed = renderExpanded(model, false, false, false);

    expect(badgeTexts(expanded)).toEqual(["ESC", "ESC"]);
    expect(withoutBadges(expanded)).toBe(withoutBadges(collapsed));
    expect(expanded.textContent).toContain("SUPER");
    expect(expanded.textContent).toContain("Copy");
  });
});
