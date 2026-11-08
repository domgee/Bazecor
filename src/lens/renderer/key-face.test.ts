import { describe, expect, test } from "vitest";
import type { KeyboardModel } from "../shared/types";
import { decodeKey, layoutOverrides, superkeyIndex, symbolOverrides } from "./keycodes";
import { faceContext, keyFace } from "./key-face";

const SUPERKEY_1 = 53980;
const SUPERKEY_2 = 53981;
const MACRO_1 = 53852;
const MACRO_2 = 53853;

const OS_TAB_MACRO = [
  { type: 6, keyCode: 227 },
  { type: 8, keyCode: 43 },
  { type: 7, keyCode: 227 },
];

const createModel = (overrides: Partial<KeyboardModel> = {}): KeyboardModel => ({
  product: "Sonsei",
  keymap: [[]],
  palette: [],
  colormap: [[]],
  defaultLayer: 0,
  superkeys: [
    [5, 6, 7, 9, 10],
    [1, 1, 1, 1, 1],
  ],
  superkeyNames: ["Nav", ""],
  macroNames: ["Copy", ""],
  macros: [OS_TAB_MACRO],
  layerNames: ["Base", "Nav"],
  combos: [],
  ...overrides,
});

describe("keyFace", () => {
  test.each(["us", "de-DE"])("FlagsOff_SameLabelAsBeforeForEveryCode %s", layout => {
    const model = createModel();
    const ctx = faceContext(model, layout, undefined);

    // Copy of the views' getLabel before the expand settings
    const overrides = layoutOverrides(layout);
    const symbols = symbolOverrides(layout);
    const names = model.layerNames?.length ? model.layerNames : [];
    const macroNames = model.macroNames ?? [];
    const oldGetLabel = (code: number) => {
      const sk = superkeyIndex(code);
      if (sk !== null) {
        const name = model.superkeyNames?.[sk] || `SK${sk + 1}`;
        return { primary: "SUPER", subtitle: name, hold: "" };
      }

      return decodeKey(code, overrides, names, macroNames, symbols);
    };

    const mismatches: number[] = [];

    for (let code = 0; code <= 65535; code += 1) {
      const face = keyFace(code, ctx);

      if (face.slots !== null || JSON.stringify(face.label) !== JSON.stringify(oldGetLabel(code))) {
        mismatches.push(code);
      }
    }

    expect(mismatches).toEqual([]);
  });

  test("ExpandMacrosOff_SameMacroNames", () => {
    const model = createModel();

    expect(faceContext(model, "us", undefined, { expandMacros: false }).macroNames).toBe(model.macroNames);
  });

  test("ExpandSuperkeys_FiveSlots", () => {
    const ctx = faceContext(createModel(), "us", undefined, { expandSuperkeys: true });

    expect(keyFace(SUPERKEY_1, ctx)).toEqual({
      label: { primary: "SUPER", subtitle: "Nav", hold: "" },
      slots: [{ text: "B" }, { text: "C" }, { text: "D" }, { text: "F" }, { text: "G" }],
    });
  });

  test("ExpandSuperkeysWithEmptySuperkey_CollapsedLabel", () => {
    const ctx = faceContext(createModel(), "us", undefined, { expandSuperkeys: true });

    expect(keyFace(SUPERKEY_2, ctx)).toEqual({ label: { primary: "SUPER", subtitle: "SK2", hold: "" }, slots: null });
  });

  test("ExpandMacros_KeysAsSubtitle", () => {
    const ctx = faceContext(createModel(), "us", undefined, { expandMacros: true, modStyle: "mac" });

    expect(keyFace(MACRO_1, ctx)).toEqual({ label: { primary: "MACRO", subtitle: "⌘TAB", hold: "" }, slots: null });
  });

  test("ExpandMacrosWithUnreadableMacro_Name", () => {
    const ctx = faceContext(createModel({ macros: [null] }), "us", undefined, { expandMacros: true, modStyle: "mac" });

    expect(keyFace(MACRO_1, ctx)).toEqual({ label: { primary: "MACRO", subtitle: "Copy", hold: "" }, slots: null });
  });

  test("ExpandMacrosWithUnreadableUnnamedMacro_Number", () => {
    const model = createModel({ macroNames: [], macros: [null] });
    const ctx = faceContext(model, "us", undefined, { expandMacros: true, modStyle: "mac" });

    expect(keyFace(MACRO_1, ctx)).toEqual({ label: { primary: "MACRO", subtitle: "1", hold: "" }, slots: null });
  });

  test("BothFlagsWithMacroInSlot_MacroKeys", () => {
    const model = createModel({ superkeys: [[MACRO_1, MACRO_2, 1, 1, 1]] });
    const ctx = faceContext(model, "us", undefined, { expandSuperkeys: true, expandMacros: true, modStyle: "mac" });

    // Macro 2 has no actions and no name, so it keeps its number
    expect(keyFace(SUPERKEY_1, ctx).slots).toEqual([{ text: "⌘TAB" }, { text: "M2" }, null, null, null]);
  });
});

describe("decodeKey", () => {
  test.each([
    [0x982b], // Cmd+Shift+Tab partial hold, slot 0
    [0xb82b], // Cmd+Shift+Tab partial hold, slot 1
  ])("PartialHold_SameFaceAsPlainAndLegacyShortcut %i", code => {
    const plain = decodeKey(0x182b);

    expect([decodeKey(code), decodeKey(0x382b)]).toEqual([plain, plain]);
    expect(plain).toEqual({ primary: expect.any(String), hold: "", modifiers: ["Shift", "OS"] });
  });
});
