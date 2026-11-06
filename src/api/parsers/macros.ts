/* eslint-disable no-bitwise */
import { MacroActionsType, MacroOptions, MacrosType } from "@Renderer/types/macros";
import { KeymapDB } from "../keymap";

/* Step types in macro memory. 14-16 exist only on firmware that lists MACROS_STATE_MARKER in help */
export const MACRO_STEP = {
  END: 0,
  RANDOM_DELAY: 1,
  WAIT: 2,
  KEYDOWN: 3,
  KEYUP: 4,
  TAP: 5,
  KEYCODEDOWN: 6,
  KEYCODEUP: 7,
  TAPCODE: 8,
  EXPLICIT_REPORT: 9,
  IMPLICIT_REPORT: 10,
  SEND_REPORT: 11,
  TAP_SEQUENCE: 12,
  TAP_CODE_SEQUENCE: 13,
  OPTIONS: 14,
  RELEASE: 15,
  UNICODE: 16,
} as const;

export const MACROS_COMMAND = "macros.map";

/* Command the firmware lists in `help` when it plays options, the release marker and Unicode steps */
export const MACROS_STATE_MARKER = "macros.state";

/* Option byte of a classic macro, which has no option step */
export const MACRO_OPTIONS_CLASSIC = 0x80;

const OPT_VALID = 0x80;
const OPT_MODE = 0x03;
const OPT_IGNORE_MODS = 0x04;
const OPT_OTHER_KEYS_STOP = 0x08;

export const MACROS_NOT_RESTORED = "Macros not restored: they use macro features this firmware lacks";

export interface MacrosDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

const macrosEraser = (tMem: number) => Array(tMem).fill("255").join(" ");

/** True when this `help` reply lists the macro upgrade marker */
export const hasMacroUpgradeMarker = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === MACROS_STATE_MARKER);
};

/** The option byte for these options, MACRO_OPTIONS_CLASSIC when there are none */
export const encodeMacroOptions = (options?: MacroOptions): number => {
  // Read null or a missing value from an imported file as classic
  if (!options) {
    return MACRO_OPTIONS_CLASSIC;
  }

  const mode = options.mode === 1 || options.mode === 2 ? options.mode : 0;
  return OPT_VALID | mode | (options.ignoreMods ? OPT_IGNORE_MODS : 0) | (options.otherKeysStop ? OPT_OTHER_KEYS_STOP : 0);
};

/** The options of an option byte, undefined for a classic macro. A byte without bit 7 reads as classic and mode 3 as once */
export const decodeMacroOptions = (byte: number): MacroOptions | undefined => {
  if ((byte & OPT_VALID) === 0) {
    return undefined;
  }

  const rawMode = byte & OPT_MODE;
  const options: MacroOptions = {
    mode: rawMode === 1 || rawMode === 2 ? rawMode : 0,
    ignoreMods: (byte & OPT_IGNORE_MODS) !== 0,
    otherKeysStop: (byte & OPT_OTHER_KEYS_STOP) !== 0,
  };

  return encodeMacroOptions(options) === MACRO_OPTIONS_CLASSIC ? undefined : options;
};

/* Number of UTF-8 bytes a lead byte announces, 0 when it is no lead of a scalar above U+007F */
const utf8Expected = (lead: number): number => {
  if (lead >= 0xc2 && lead <= 0xdf) {
    return 2;
  }

  if (lead >= 0xe0 && lead <= 0xef) {
    return 3;
  }

  if (lead >= 0xf0 && lead <= 0xf4) {
    return 4;
  }

  return 0;
};

const isContinuation = (byte: number) => byte >= 0x80 && byte <= 0xbf;

/** Payload length of a Unicode step at pos, a lead byte C2..F4 and the continuation bytes that follow it, at most the lead's length.
 * 0 when bytes[pos] is no lead, so the next byte is read as a step. */
export const utf8StepLength = (bytes: ArrayLike<number>, pos: number): number => {
  if (pos >= bytes.length) {
    return 0;
  }

  const expected = utf8Expected(bytes[pos]);

  if (expected === 0) {
    return 0;
  }

  let length = 1;

  while (length < expected && pos + length < bytes.length && isContinuation(bytes[pos + length])) {
    length += 1;
  }

  return length;
};

/** The code point of the UTF-8 bytes, or undefined for truncated, overlong, surrogate or out of range input */
export const utf8Decode = (bytes: ArrayLike<number>, pos: number, length: number): number | undefined => {
  const lead = bytes[pos];
  const expected = utf8Expected(lead);

  if (expected === 0 || length !== expected) {
    return undefined;
  }

  const second = bytes[pos + 1];

  if ((lead === 0xe0 && second < 0xa0) || (lead === 0xed && second >= 0xa0)) {
    return undefined;
  }

  if ((lead === 0xf0 && second < 0x90) || (lead === 0xf4 && second >= 0x90)) {
    return undefined;
  }

  let cp = lead & (0xff >> (expected + 1));

  for (let i = 1; i < expected; i += 1) {
    const byte = bytes[pos + i];

    if (!isContinuation(byte)) {
      return undefined;
    }

    cp = (cp << 6) | (byte & 0x3f);
  }

  return cp;
};

/** The UTF-8 bytes of a code point above U+007F. Empty for ASCII, surrogates and values above U+10FFFF */
export const utf8Encode = (cp: number): number[] => {
  if (!Number.isInteger(cp) || cp < 0x80 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
    return [];
  }

  if (cp < 0x800) {
    return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  }

  if (cp < 0x10000) {
    return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  }

  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
};

/** Payload length of the step of this type whose payload starts at pos, clipped to the end of memory. Shared with the firmware */
export const macroStepLength = (bytes: ArrayLike<number>, pos: number, type: number): number => {
  const available = Math.max(0, bytes.length - pos);
  let length = 0;

  switch (type) {
    case MACRO_STEP.RANDOM_DELAY:
      length = 4;
      break;
    case MACRO_STEP.WAIT:
    case MACRO_STEP.KEYDOWN:
    case MACRO_STEP.KEYUP:
    case MACRO_STEP.TAP:
      length = 2;
      break;
    case MACRO_STEP.KEYCODEDOWN:
    case MACRO_STEP.KEYCODEUP:
    case MACRO_STEP.TAPCODE:
    case MACRO_STEP.OPTIONS:
      length = 1;
      break;
    case MACRO_STEP.TAP_SEQUENCE: {
      // Pairs up to and including the (0, 0) terminator
      let i = pos;

      while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) {
        i += 2;
      }

      length = i + 2 - pos;
      break;
    }
    case MACRO_STEP.TAP_CODE_SEQUENCE: {
      // Bytes up to and including the 0 terminator
      let i = pos;

      while (i < bytes.length && bytes[i] !== 0) {
        i += 1;
      }

      length = i + 1 - pos;
      break;
    }
    case MACRO_STEP.UNICODE:
      length = utf8StepLength(bytes, pos);
      break;
    default:
      length = 0;
  }

  return Math.min(length, available);
};

interface MacroStep {
  type: number;
  payload: number[];
}

/* Walk macro memory step by step. Every END closes a macro, END END ends the map and the bytes after it are ignored. Steps after the last
 * END without a closing END are returned as the tail. */
const walkMacroSteps = (bytes: ArrayLike<number>): { macros: MacroStep[][]; tail: MacroStep[] } => {
  const macros: MacroStep[][] = [];
  let current: MacroStep[] = [];
  let previousEnd = false;
  let pos = 0;

  while (pos < bytes.length) {
    const type = bytes[pos];
    pos += 1;

    if (type === MACRO_STEP.END) {
      if (previousEnd) {
        break;
      }

      macros.push(current);
      current = [];
      previousEnd = true;
    } else {
      previousEnd = false;
      const length = macroStepLength(bytes, pos, type);
      current.push({ type, payload: Array.from({ length }, (_, i) => bytes[pos + i]) });
      pos += length;
    }
  }

  return { macros, tail: current };
};

const word = (hi: number, lo: number) => (hi << 8) | lo;

/* The editor action of a step, undefined for options, unknown steps and invalid payloads */
const stepToAction = ({ type, payload }: MacroStep): MacroActionsType | undefined => {
  switch (type) {
    case MACRO_STEP.RANDOM_DELAY:
      return payload.length === 4 ? { type, keyCode: [word(payload[0], payload[1]), word(payload[2], payload[3])] } : undefined;
    case MACRO_STEP.WAIT:
    case MACRO_STEP.KEYDOWN:
    case MACRO_STEP.KEYUP:
    case MACRO_STEP.TAP:
      return payload.length === 2 ? { type, keyCode: word(payload[0], payload[1]) } : undefined;
    case MACRO_STEP.KEYCODEDOWN:
    case MACRO_STEP.KEYCODEUP:
    case MACRO_STEP.TAPCODE:
      return payload.length === 1 ? { type, keyCode: payload[0] } : undefined;
    case MACRO_STEP.EXPLICIT_REPORT:
    case MACRO_STEP.IMPLICIT_REPORT:
    case MACRO_STEP.SEND_REPORT:
    case MACRO_STEP.RELEASE:
      return { type, keyCode: 0 };
    case MACRO_STEP.TAP_SEQUENCE: {
      const keys: number[] = [];

      for (let i = 0; i + 1 < payload.length && !(payload[i] === 0 && payload[i + 1] === 0); i += 2) {
        keys.push(word(payload[i], payload[i + 1]));
      }

      return { type, keyCode: keys };
    }
    case MACRO_STEP.TAP_CODE_SEQUENCE:
      return { type, keyCode: payload.filter(code => code !== 0) };
    case MACRO_STEP.UNICODE: {
      const cp = payload.length > 0 ? utf8Decode(payload, 0, payload.length) : undefined;
      return cp === undefined ? undefined : { type, keyCode: cp };
    }
    default:
      return undefined;
  }
};

const stepsToMacro = (steps: MacroStep[], id: number): MacrosType => {
  let options: MacroOptions | undefined;
  let body = steps;

  if (steps.length > 0 && steps[0].type === MACRO_STEP.OPTIONS) {
    options = steps[0].payload.length === 1 ? decodeMacroOptions(steps[0].payload[0]) : undefined;
    body = steps.slice(1);
  }

  let actions = body.map(stepToAction).filter((a): a is MacroActionsType => a !== undefined);

  // A lone implicit report is how an empty macro is written
  if (options === undefined && actions.length === 1 && actions[0].type === MACRO_STEP.IMPLICIT_REPORT) {
    actions = [];
  }

  const macro: MacrosType = { actions, id, name: "", macro: "" };

  if (options !== undefined) {
    macro.options = options;
  }

  return macro;
};

/** The macros in macro memory. A tail without END that holds a valid action becomes the last macro, because older firmware plays it.
 * Memory without any macro reads as one empty macro. */
export const parseMacroBytes = (bytes: ArrayLike<number>): MacrosType[] => {
  const { macros, tail } = walkMacroSteps(bytes);
  const parsed = macros.map((steps, id) => stepsToMacro(steps, id));
  const tailMacro = stepsToMacro(tail, parsed.length);

  if (tailMacro.actions.length > 0) {
    parsed.push(tailMacro);
  }

  if (parsed.length === 0) {
    return [{ actions: [], id: 0, name: "", macro: "" }];
  }

  return parsed;
};

/* Bytes of a macros.map reply, with anything that is no byte read as erased memory */
const rawToBytes = (raw: unknown): number[] => {
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }

  return raw
    .trim()
    .split(/\s+/)
    .map(Number)
    .map(n => (Number.isInteger(n) && n >= 0 && n <= 255 ? n : 255));
};

const STEP_UPGRADE_TYPES: number[] = [MACRO_STEP.OPTIONS, MACRO_STEP.RELEASE, MACRO_STEP.UNICODE];

const stepsNeedUpgrade = (bytes: ArrayLike<number>) => {
  const { macros, tail } = walkMacroSteps(bytes);
  return [...macros.flat(), ...tail].some(step => STEP_UPGRADE_TYPES.includes(step.type));
};

/** True when this macros.map data holds an option, release marker or Unicode step, which older firmware stops at */
export const rawMacrosNeedUpgrade = (raw: unknown): boolean => stepsNeedUpgrade(rawToBytes(raw));

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

/** True when this macro writes an option, release marker or Unicode step, which older firmware stops at */
export const macroNeedsUpgrade = (macro: MacrosType): boolean => stepsNeedUpgrade([...macroBytes(macro), 0, 0]);

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

/** Restore a backed-up macros.map. Refuse data with steps 14-16 when the keyboard lacks the marker, because older firmware stops at
 * them, and return the warning instead of sending. A failed help read counts as no marker. */
export const restoreMacrosMap = async (
  device: MacrosDevice,
  data: string,
  sendPlain: () => Promise<unknown>,
): Promise<string | undefined> => {
  if (rawMacrosNeedUpgrade(data)) {
    let help: unknown;

    try {
      help = await device.noCacheCommand("help");
    } catch (error) {
      help = undefined;
    }

    if (!hasMacroUpgradeMarker(help)) {
      return MACROS_NOT_RESTORED;
    }
  }

  await sendPlain();
  return undefined;
};
