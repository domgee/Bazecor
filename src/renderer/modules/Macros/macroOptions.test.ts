import { describe, expect, test } from "vitest";
import { MacroActionsType, MacroOptions, MacrosType } from "@Renderer/types/macros";
import { macroNeedsUpgrade, resetMacroOptions } from "../../../api/parsers/macros";
import { canAddMarker, loopModesAllowed } from "./macroOptions";

const TAP_A: MacroActionsType = { type: 8, keyCode: 4 };
const RELEASE: MacroActionsType = { type: 15, keyCode: 0 };

const macro = (actions: MacroActionsType[], options?: MacroOptions): MacrosType => ({ actions, name: "", macro: "", options });

describe("canAddMarker and loopModesAllowed", () => {
  test("a once macro without a marker allows both", () => {
    const m = macro([TAP_A], { mode: 0, ignoreMods: true, otherKeysStop: true });

    expect([canAddMarker(m), loopModesAllowed(m)]).toEqual([true, true]);
  });

  test("a classic macro counts as once", () => {
    const m = macro([TAP_A]);

    expect([canAddMarker(m), loopModesAllowed(m)]).toEqual([true, true]);
  });

  test("a marker blocks a second marker and the loop modes", () => {
    const m = macro([TAP_A, RELEASE, TAP_A], { mode: 0, ignoreMods: true, otherKeysStop: true });

    expect([canAddMarker(m), loopModesAllowed(m)]).toEqual([false, false]);
  });

  test("a loop mode blocks the marker", () => {
    const repeat = macro([TAP_A], { mode: 1, ignoreMods: true, otherKeysStop: true });
    const toggle = macro([TAP_A], { mode: 2, ignoreMods: false, otherKeysStop: false });

    expect([canAddMarker(repeat), canAddMarker(toggle), loopModesAllowed(repeat)]).toEqual([false, false, true]);
  });
});

describe("resetMacroOptions", () => {
  test("a macro with only options plays on older firmware after the reset", () => {
    const m = macro([TAP_A], { mode: 2, ignoreMods: true, otherKeysStop: true });

    expect([macroNeedsUpgrade(m), macroNeedsUpgrade(resetMacroOptions(m))]).toEqual([true, false]);
  });

  test("a macro with a marker still needs the upgrade after the reset", () => {
    const m = macro([TAP_A, RELEASE], { mode: 2, ignoreMods: true, otherKeysStop: true });

    expect(macroNeedsUpgrade(resetMacroOptions(m))).toBe(true);
  });
});
