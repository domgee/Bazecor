import { ListToDeleteMType } from "@Renderer/types/macroEditor";
import { MacrosType } from "@Renderer/types/macros";
import { MACRO_STEP } from "../../../api/parsers/macros";
import { MACRO_FIRST } from "../../../api/parsers/altRepeat";

const KEY_STEPS: number[] = [MACRO_STEP.KEYDOWN, MACRO_STEP.KEYUP, MACRO_STEP.TAP];

/** The macro actions that play the deleted macro or a macro after it, which moves down by one. `macroIdx` is the index in the list
 * without the deleted macro. `newKey` is -1 for the deleted macro and the new index of a moved one. Only key steps can play a macro, so
 * a delay of the same value is no reference, and the deleted macro's own actions go with it. */
export const findMacroActionRefs = (macros: MacrosType[], deletedIdx: number): ListToDeleteMType[] => {
  const refs: ListToDeleteMType[] = [];

  macros.forEach((macro, macroIdx) => {
    if (macroIdx === deletedIdx || !Array.isArray(macro.actions)) {
      return;
    }

    macro.actions.forEach((action, pos) => {
      if (!action || !KEY_STEPS.includes(action.type) || typeof action.keyCode !== "number") {
        return;
      }

      const target = action.keyCode - MACRO_FIRST;

      if (target < deletedIdx || target >= macros.length) {
        return;
      }

      refs.push({
        macroIdx: macroIdx < deletedIdx ? macroIdx : macroIdx - 1,
        pos,
        newKey: target === deletedIdx ? -1 : target - 1,
        actions: macro.actions,
      });
    });
  });

  return refs;
};
