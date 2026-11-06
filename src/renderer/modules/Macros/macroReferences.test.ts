import { describe, expect, test } from "vitest";
import { MacroActionsType, MacrosType } from "@Renderer/types/macros";
import { findMacroActionRefs } from "./macroReferences";

// Key code of macro #1 (index 0)
const MACRO_FIRST = 53852;

const macro = (actions: MacroActionsType[]): MacrosType => ({ actions, name: "", macro: "" });

describe("findMacroActionRefs", () => {
  test("matches only key steps that play the deleted or a later macro, with indices after the delete", () => {
    const macros = [
      // Index 0, before the deleted macro, keeps its index
      macro([
        { type: 5, keyCode: MACRO_FIRST + 1 },
        // A delay of the same value as macro #3 is no reference
        { type: 2, keyCode: MACRO_FIRST + 2 },
        { type: 3, keyCode: MACRO_FIRST + 2 },
      ]),
      // Index 1 is deleted, so its own reference is skipped
      macro([{ type: 5, keyCode: MACRO_FIRST + 2 }]),
      // Index 2 moves to 1
      macro([
        { type: 8, keyCode: 4 },
        { type: 4, keyCode: MACRO_FIRST + 2 },
        // Macro #1 stays where it is
        { type: 5, keyCode: MACRO_FIRST },
      ]),
    ];

    const refs = findMacroActionRefs(macros, 1);

    expect(refs.map(({ macroIdx, pos, newKey }) => ({ macroIdx, pos, newKey }))).toEqual([
      { macroIdx: 0, pos: 0, newKey: -1 },
      { macroIdx: 0, pos: 2, newKey: 1 },
      { macroIdx: 1, pos: 1, newKey: 1 },
    ]);
  });

  test("leaves a WAIT of 53854 untouched", () => {
    // 53854 is macro #3, which moves down when #1 is deleted
    const macros = [macro([]), macro([{ type: 2, keyCode: 53854 }]), macro([])];

    expect(findMacroActionRefs(macros, 0)).toEqual([]);
  });
});
