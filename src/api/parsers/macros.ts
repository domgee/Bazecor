/* eslint-disable no-bitwise */
import { MacroActionsType, MacrosType } from "@Renderer/types/macros";
import { KeymapDB } from "../keymap";
import {
  MACRO_OPTIONS_CLASSIC,
  MACRO_STEP,
  encodeMacroOptions,
  parseMacroBytes,
  rawToBytes,
  utf8Encode,
  walkMacroSteps,
} from "./macroSteps";

export {
  MACRO_STEP,
  MACRO_OPTIONS_CLASSIC,
  encodeMacroOptions,
  decodeMacroOptions,
  utf8StepLength,
  utf8Decode,
  utf8Encode,
  macroStepLength,
  parseMacroBytes,
} from "./macroSteps";

/* The highest step type Bazecor knows */
const MACRO_STEP_LAST = MACRO_STEP.LAYER_OFF;

export const MACROS_COMMAND = "macros.map";

/* Command the firmware lists in `help` when it plays options, the release marker and Unicode steps */
export const MACROS_STATE_MARKER = "macros.state";

/* Read-only command that replies the highest step type the firmware plays */
export const MACROS_STEPS_COMMAND = "macros.steps";

/* Highest step type of firmware without the macro upgrade */
export const MACRO_STEP_LIMIT_CLASSIC = 13;

/* Highest step type of firmware that lists MACROS_STATE_MARKER but not MACROS_STEPS_COMMAND */
export const MACRO_STEP_LIMIT_UPGRADE = 16;

export const MACROS_NOT_RESTORED = "Macros not restored: they use macro features this firmware lacks";

export interface MacrosDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

const macrosEraser = (tMem: number) => Array(tMem).fill("255").join(" ");

const helpLists = (help: unknown, command: string): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === command);
};

/** True when this `help` reply lists the macro upgrade marker */
export const hasMacroUpgradeMarker = (help: unknown): boolean => helpLists(help, MACROS_STATE_MARKER);

/* The step limit a MACROS_STEPS_COMMAND reply gives, MACRO_STEP_LIMIT_UPGRADE for anything but an integer from 17 to 255 */
const parseStepLimit = (reply: unknown): number => {
  if (typeof reply !== "string" || !/^\d+$/.test(reply.trim())) {
    return MACRO_STEP_LIMIT_UPGRADE;
  }

  const limit = Number(reply.trim());
  return limit > MACRO_STEP_LIMIT_UPGRADE && limit <= 255 ? limit : MACRO_STEP_LIMIT_UPGRADE;
};

/** The highest step type the keyboard plays, from its `help` reply and, when help lists it, the MACROS_STEPS_COMMAND reply.
 * A failed read gives MACRO_STEP_LIMIT_UPGRADE. */
export const readMacroStepLimit = async (device: MacrosDevice, help: unknown): Promise<number> => {
  if (!helpLists(help, MACROS_STATE_MARKER)) {
    return MACRO_STEP_LIMIT_CLASSIC;
  }

  if (!helpLists(help, MACROS_STEPS_COMMAND)) {
    return MACRO_STEP_LIMIT_UPGRADE;
  }

  try {
    return parseStepLimit(await device.noCacheCommand(MACROS_STEPS_COMMAND));
  } catch (error) {
    return MACRO_STEP_LIMIT_UPGRADE;
  }
};

/** The step limit to use from the stored capabilities. Without the upgrade it is MACRO_STEP_LIMIT_CLASSIC, with it a stored integer
 * from 16 to 255 is kept and anything else gives MACRO_STEP_LIMIT_UPGRADE. */
export const macroStepLimit = (stored: unknown, upgrade: boolean): number => {
  if (!upgrade) {
    return MACRO_STEP_LIMIT_CLASSIC;
  }

  if (typeof stored === "number" && Number.isInteger(stored) && stored >= MACRO_STEP_LIMIT_UPGRADE && stored <= 255) {
    return stored;
  }

  return MACRO_STEP_LIMIT_UPGRADE;
};

/* The highest known step type in the walked steps, 0 for none. Unknown types such as erased memory between two ENDs are left out */
const highestStep = (bytes: ArrayLike<number>): number => {
  const { macros, tail } = walkMacroSteps(bytes);
  return [...macros.flat(), ...tail].reduce((highest, step) => (step.type <= MACRO_STEP_LAST ? Math.max(highest, step.type) : highest), 0);
};

/** The highest step type this macros.map data holds, 0 when it holds none */
export const rawMacrosHighestStep = (raw: unknown): number => highestStep(rawToBytes(raw));

/** True when this macros.map data holds a step above 13, which firmware without the macro upgrade stops at */
export const rawMacrosNeedUpgrade = (raw: unknown): boolean => rawMacrosHighestStep(raw) > MACRO_STEP_LIMIT_CLASSIC;

const keyBytes = (keyCode: number) => [(keyCode >> 8) & 255, keyCode & 255];

const isValidKeyCode = (keyCode: number | number[]) =>
  Array.isArray(keyCode) ? keyCode.every(k => Number.isFinite(k)) : Number.isFinite(keyCode);

/* The bytes of one action. Options, unknown types and invalid Unicode give none */
const actionBytes = (action: MacroActionsType): number[] => {
  const { type, keyCode } = action;

  if (!isValidKeyCode(keyCode)) {
    return [];
  }

  const code = Array.isArray(keyCode) ? (keyCode[0] ?? 0) : keyCode;

  switch (type) {
    case MACRO_STEP.RANDOM_DELAY: {
      const [min, max] = Array.isArray(keyCode) ? keyCode : [keyCode, keyCode];
      return [type, ...keyBytes(min ?? 0), ...keyBytes(max ?? min ?? 0)];
    }
    case MACRO_STEP.WAIT:
    case MACRO_STEP.KEYDOWN:
    case MACRO_STEP.KEYUP:
    case MACRO_STEP.TAP:
      return [type, ...keyBytes(code)];
    case MACRO_STEP.KEYCODEDOWN:
    case MACRO_STEP.KEYCODEUP:
    case MACRO_STEP.TAPCODE:
      return [type, code & 255];
    case MACRO_STEP.EXPLICIT_REPORT:
    case MACRO_STEP.IMPLICIT_REPORT:
    case MACRO_STEP.SEND_REPORT:
    case MACRO_STEP.RELEASE:
    case MACRO_STEP.LAYER_OFF:
      return [type];
    case MACRO_STEP.TAP_SEQUENCE: {
      const keys = (Array.isArray(keyCode) ? keyCode : [keyCode]).filter(k => (k & 0xffff) !== 0);
      return [type, ...keys.flatMap(keyBytes), 0, 0];
    }
    case MACRO_STEP.TAP_CODE_SEQUENCE: {
      const codes = (Array.isArray(keyCode) ? keyCode : [keyCode]).map(k => k & 255).filter(k => k !== 0);
      return [type, ...codes, 0];
    }
    case MACRO_STEP.UNICODE: {
      const utf8 = utf8Encode(code);
      return utf8.length > 0 ? [type, ...utf8] : [];
    }
    default:
      return [];
  }
};

/* The bytes of one macro without its END. An empty macro becomes a lone implicit report, because END END would end the map */
const macroBytes = (macro: MacrosType): number[] => {
  const options = encodeMacroOptions(macro.options);
  const bytes = options === MACRO_OPTIONS_CLASSIC ? [] : [MACRO_STEP.OPTIONS, options];
  const actions = Array.isArray(macro.actions) ? macro.actions : [];

  actions.forEach(action => {
    if (action) {
      bytes.push(...actionBytes(action));
    }
  });

  return bytes.length > 0 ? bytes : [MACRO_STEP.IMPLICIT_REPORT];
};

/** The macro memory bytes of these macros, each closed by END and the map closed by a second END */
export const macrosBytes = (macros: MacrosType[]): number[] => [
  ...macros.flatMap(macro => [...macroBytes(macro), MACRO_STEP.END]),
  MACRO_STEP.END,
];

/** Bytes the macros take in macro memory, 0 for no macros */
export const macrosByteLength = (macros: MacrosType[]): number => (macros.length === 0 ? 0 : macrosBytes(macros).length);

/** The highest step type this macro writes */
export const macroHighestStep = (macro: MacrosType): number => highestStep([...macroBytes(macro), 0, 0]);

/** True when this macro writes a step above 13, which firmware without the macro upgrade stops at */
export const macroNeedsUpgrade = (macro: MacrosType): boolean => macroHighestStep(macro) > MACRO_STEP_LIMIT_CLASSIC;

/** The macro as a classic macro, without options */
export const resetMacroOptions = (macro: MacrosType): MacrosType => ({ ...macro, options: undefined });

/* A text label for one action */
const actionLabel = (keymapDB: KeymapDB, action: MacroActionsType): unknown => {
  const { type, keyCode } = action;

  if (type === MACRO_STEP.UNICODE && typeof keyCode === "number") {
    return String.fromCodePoint(keyCode);
  }

  if (type === MACRO_STEP.RELEASE) {
    return "Release";
  }

  if (type === MACRO_STEP.LAYER_OFF) {
    return "Layer off";
  }

  if (Array.isArray(keyCode)) {
    return type === MACRO_STEP.RANDOM_DELAY ? keyCode.join("-") : keyCode.map(k => keymapDB.parse(k).label).join(" ");
  }

  return keymapDB.parse(keyCode).label;
};

export const parseMacrosRaw = (raw: string, storedMacros?: MacrosType[]) => {
  const macros = parseMacroBytes(rawToBytes(raw));

  // TODO: Check if stored macros match the received ones, if they match, retrieve name and apply it to current macros
  const stored = storedMacros;
  if (stored === undefined || stored.length === 0) {
    return macros;
  }

  // Build the labels in the language selected now
  const keymapDB = new KeymapDB();
  return macros.map((macro, i) => {
    if (stored.length < i) {
      return macro;
    }

    return {
      ...macro,
      name: stored[i]?.name,
      macro: macro.actions.map(action => actionLabel(keymapDB, action)).join(" "),
    };
  });
};

export const serializeMacros = (macros: MacrosType[], tMem: number) => {
  if (macros.length === 0 || (macros.length === 1 && !Array.isArray(macros[0].actions))) {
    return macrosEraser(tMem);
  }

  return macrosBytes(macros).join(" ");
};

/** Restore a backed-up macros.map. Refuse data with a step above the keyboard's step limit, because older firmware stops at or skips
 * it, and return the warning instead of sending. A failed help read counts as no marker. */
export const restoreMacrosMap = async (
  device: MacrosDevice,
  data: string,
  sendPlain: () => Promise<unknown>,
): Promise<string | undefined> => {
  const highest = rawMacrosHighestStep(data);

  if (highest > MACRO_STEP_LIMIT_CLASSIC) {
    let help: unknown;

    try {
      help = await device.noCacheCommand("help");
    } catch (error) {
      help = undefined;
    }

    // Read MACROS_STEPS_COMMAND only for steps that firmware with the marker alone lacks
    let limit = hasMacroUpgradeMarker(help) ? MACRO_STEP_LIMIT_UPGRADE : MACRO_STEP_LIMIT_CLASSIC;

    if (highest > MACRO_STEP_LIMIT_UPGRADE) {
      limit = await readMacroStepLimit(device, help);
    }

    if (highest > limit) {
      return MACROS_NOT_RESTORED;
    }
  }

  await sendPlain();
  return undefined;
};
