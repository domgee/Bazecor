import { MacroOptions, MacrosType } from "@Renderer/types/macros";
import { MACRO_OPTIONS_CLASSIC, MACRO_STEP, decodeMacroOptions, encodeMacroOptions } from "../../../api/parsers/macros";

/* Options of a macro created on firmware with the macro upgrade */
export const NEW_MACRO_OPTIONS: MacroOptions = { mode: 0, ignoreMods: true, otherKeysStop: true };

/* What the panel shows for a classic macro, which plays once without masking modifiers or stopping on other keys */
const CLASSIC_OPTIONS: MacroOptions = { mode: 0, ignoreMods: false, otherKeysStop: false };

export const hasReleaseMarker = (macro: MacrosType): boolean =>
  Array.isArray(macro.actions) && macro.actions.some(action => action?.type === MACRO_STEP.RELEASE);

/** True when the options differ from a classic macro, so the macro needs an option step */
export const hasMacroOptions = (macro: MacrosType): boolean => encodeMacroOptions(macro.options) !== MACRO_OPTIONS_CLASSIC;

/** The options to show, the classic ones when the macro has none */
export const effectiveOptions = (macro: MacrosType): MacroOptions => macro.options ?? CLASSIC_OPTIONS;

/** The options to store, undefined when they equal a classic macro. Also cleans up options read from an imported file */
export const normalizeOptions = (options?: MacroOptions): MacroOptions | undefined =>
  decodeMacroOptions(encodeMacroOptions(options));

/** The firmware ignores the release marker in loop modes, so the loop modes need a macro without one */
export const loopModesAllowed = (macro: MacrosType): boolean => !hasReleaseMarker(macro);

/** The firmware honours only the first marker and only in once mode */
export const canAddMarker = (macro: MacrosType): boolean => effectiveOptions(macro).mode === 0 && !hasReleaseMarker(macro);
