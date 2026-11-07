import type { LensCombo, LensMacroAction, PaletteColor } from "../shared/types";
import { MACRO_STEP, parseMacroBytes, rawToBytes, stepToAction, walkMacroSteps } from "../../api/parsers/macroSteps";
import type { MacroStep } from "../../api/parsers/macroSteps";
import { COMBO_LAYER_ANY } from "../shared/types";

export function parseKeymap(raw: string, keysPerLayer: number): number[][] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers: number[][] = [];
  for (let i = 0; i < nums.length; i += keysPerLayer) {
    layers.push(nums.slice(i, i + keysPerLayer));
  }
  return layers;
}

export function parsePaletteRGB(raw: string): PaletteColor[] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const out: PaletteColor[] = [];
  for (let i = 0; i + 2 < nums.length; i += 3) {
    const [r, g, b] = nums.slice(i, i + 3);
    out.push({ r, g, b, w: 0, rgb: `rgb(${r},${g},${b})` });
  }
  return out;
}

export function parsePaletteRGBW(raw: string): PaletteColor[] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const out: PaletteColor[] = [];
  for (let i = 0; i + 3 < nums.length; i += 4) {
    const [r, g, b, w] = nums.slice(i, i + 4);
    // Match Bazecor's rgbw2b (src/api/color/RGBWtoRGB.ts): the white channel is
    // additive on top of r/g/b, clamped to 255. Without this, a pure white LED
    // (r=g=b=0, w=255) would render as black.
    const dr = Math.min(255, Math.max(0, r) + Math.max(0, w));
    const dg = Math.min(255, Math.max(0, g) + Math.max(0, w));
    const db = Math.min(255, Math.max(0, b) + Math.max(0, w));
    out.push({ r: dr, g: dg, b: db, w, rgb: `rgb(${dr},${dg},${db})` });
  }
  return out;
}

export function parseColormap(raw: string, layerSize: number): number[][] {
  const nums = raw.trim().split(/\s+/).map(Number);
  const layers: number[][] = [];
  for (let i = 0; i < nums.length; i += layerSize) {
    layers.push(nums.slice(i, i + layerSize));
  }
  return layers;
}

const MAX_SUPERKEYS = 128;
const ACTIONS_PER_SUPERKEY = 5;
const SUPERKEY_END = 0;
const SUPERKEY_ERASED = 65535;
const SUPERKEY_ACTION_EMPTY = 1;

/* `superkeys.map` wire format, as in Bazecor src/api/parsers/superkeys.ts. Each Superkey is its actions and a 0, a second 0 ends the
 * map and 65535 fills the rest. An empty action is 1. */
export function parseSuperkeys(raw: string): number[][] {
  if (!raw.trim()) {
    return [];
  }

  const nums = raw.trim().split(/\s+/).map(Number);
  const out: number[][] = [];
  let current: number[] = [];

  for (const n of nums) {
    if (out.length >= MAX_SUPERKEYS) {
      break;
    }

    if (n === SUPERKEY_END) {
      if (current.length === 0) {
        break;
      }

      out.push(current);
      current = [];
    } else if (n === SUPERKEY_ERASED && current.length === 0) {
      break;
    } else {
      current.push(n);
    }
  }

  if (current.length > 0 && out.length < MAX_SUPERKEYS) {
    out.push(current);
  }

  return out.map(actions => {
    const cut = actions.slice(0, ACTIONS_PER_SUPERKEY);
    return cut.concat(new Array<number>(ACTIONS_PER_SUPERKEY - cut.length).fill(SUPERKEY_ACTION_EMPTY));
  });
}

const MAX_MACROS = 128;

/* Lens shows a macro only when every step is complete. Stricter than the editor parser, which drops what it cannot read */
function isReadableStep(step: MacroStep): boolean {
  const { type, payload } = step;

  if (type === MACRO_STEP.OPTIONS) {
    return payload.length === 1;
  }

  if (type === MACRO_STEP.TAP_SEQUENCE) {
    const n = payload.length;
    return n >= 2 && n % 2 === 0 && payload[n - 2] === 0 && payload[n - 1] === 0;
  }

  if (type === MACRO_STEP.TAP_CODE_SEQUENCE) {
    return payload.length >= 1 && payload[payload.length - 1] === 0;
  }

  return stepToAction(step) !== undefined;
}

/** Actions of each macro in `macros.map`, in macro order. A macro with a step Lens cannot read is null, so the overlay keeps its name */
export function parseMacros(raw: string): (LensMacroAction[] | null)[] {
  const bytes = rawToBytes(raw);

  if (bytes.length === 0) {
    return [];
  }

  const { macros, tail } = walkMacroSteps(bytes);
  const steps = [...macros, tail];
  return parseMacroBytes(bytes)
    .slice(0, MAX_MACROS)
    .map((m, i) => (steps[i].every(isReadableStep) ? m.actions.map(({ type, keyCode }) => ({ type, keyCode })) : null));
}

/* `combos.map` wire format (Bazecor src/api/parsers/combos.ts): a count, then
 * a fixed 32 records of [p0..p5, layer, flags, action]. Backups taken with
 * the first combos firmware carry four positions instead, and there layer 255
 * meant "every layer". The record count is fixed, so the reply length says
 * which format it is. */
const MAX_COMBOS = 32;
const COMBO_MEMBERS = 6;
const LEGACY_COMBO_MEMBERS = 4;
const LEGACY_COMBO_LAYER_ANY = 255;
const COMBO_POSITION_UNUSED = 255;
const COMBO_FLAG_ENABLED = 0x01;

/** Enabled combos with at least one key, in list order (combo N is index N-1). */
export function parseCombos(raw: string): LensCombo[] {
  if (!raw.trim()) return [];
  const nums = raw.trim().split(/\s+/).map(Number);
  const count = nums[0];
  if (!Number.isFinite(count) || count <= 0) return [];

  const legacy = nums.length === 1 + MAX_COMBOS * (LEGACY_COMBO_MEMBERS + 3);
  const members = legacy ? LEGACY_COMBO_MEMBERS : COMBO_MEMBERS;
  const fields = members + 3;

  const out: LensCombo[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = 1 + i * fields;
    if (base + fields > nums.length) break;
    const positions = nums.slice(base, base + members).filter(p => p !== COMBO_POSITION_UNUSED);
    const storedLayer = nums[base + members];
    const flags = nums[base + members + 1];
    const layer = legacy && storedLayer === LEGACY_COMBO_LAYER_ANY ? COMBO_LAYER_ANY : storedLayer;
    // Disabled combos keep their slot so the numbering matches Bazecor's "C<n>".
    // eslint-disable-next-line no-bitwise
    out.push({ positions: flags & COMBO_FLAG_ENABLED ? positions : [], layer });
  }
  return out;
}

export function parseNames(raw: string): string[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* fall through to space-split */
  }
  return raw.trim().split(/\s+/);
}

export function parseActiveLayer(raw: string): number {
  const bits = parseInt(raw.trim(), 10);
  if (Number.isNaN(bits) || bits === 0) return 0;
  return Math.floor(Math.log2(bits));
}
