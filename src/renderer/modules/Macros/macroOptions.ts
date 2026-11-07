import { MacroOptions, MacrosType } from "@Renderer/types/macros";
import { MACRO_OPTIONS_CLASSIC, MACRO_STEP, decodeMacroOptions, encodeMacroOptions } from "../../../api/parsers/macros";

/* Options of a macro created on firmware with the macro upgrade */
export const NEW_MACRO_OPTIONS: MacroOptions = { mode: 0, ignoreMods: true, otherKeysStop: true };

/* What the panel shows for a classic macro, which plays once without masking modifiers or stopping on other keys */
const CLASSIC_OPTIONS: MacroOptions = { mode: 0, ignoreMods: false, otherKeysStop: false };

/** True for the pause steps, Pause until release and Pause until layer off */
export const isPauseMarker = (type: number | undefined): boolean => type === MACRO_STEP.RELEASE || type === MACRO_STEP.LAYER_OFF;

/** True when the macro holds a pause step */
export const hasPauseMarker = (macro: MacrosType): boolean =>
  Array.isArray(macro.actions) && macro.actions.some(action => isPauseMarker(action?.type));

/** True when the options differ from a classic macro, so the macro needs an option step */
export const hasMacroOptions = (macro: MacrosType): boolean => encodeMacroOptions(macro.options) !== MACRO_OPTIONS_CLASSIC;

/** The options to show, the classic ones when the macro has none */
export const effectiveOptions = (macro: MacrosType): MacroOptions => macro.options ?? CLASSIC_OPTIONS;

/** The options to store, undefined when they equal a classic macro. Also cleans up options read from an imported file */
export const normalizeOptions = (options?: MacroOptions): MacroOptions | undefined =>
  decodeMacroOptions(encodeMacroOptions(options));

/** Allow the loop modes only without a pause step, since the firmware ignores it in loop modes */
export const loopModesAllowed = (macro: MacrosType): boolean => !hasPauseMarker(macro);

/** Allow a new pause step only in once mode and only when there is none, since the firmware honours just the first one */
export const canAddMarker = (macro: MacrosType): boolean => effectiveOptions(macro).mode === 0 && !hasPauseMarker(macro);
