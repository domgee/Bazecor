/* eslint-disable no-bitwise */
/* Bazecor
 * Copyright (C) 2026  DygmaLab SE.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { ConditionalLayerRule } from "@Renderer/types/conditionalLayers";

/* Conditional layers as ZMK conditional layers and QMK tri-layer, ConditionalLayersDygma in the Sonsei firmware.
 *
 * The wire format of `conditional.map` for read and write is the count, then count x `ifMask thenLayer`.
 * Bit n of ifMask and a thenLayer of n are firmware layer n, which Bazecor labels n + 1.
 * A write is all or nothing. A rejected write keeps the old table and replies `error`. The virtual keyboard echoes the payload
 * instead, so every write is read back.
 */

export const CONDITIONAL_LAYERS_COMMAND = "conditional.map";
export const MAX_CONDITIONAL_LAYERS = 8;
export const CL_LAYER_COUNT = 10;
export const CL_LAYERS_MASK = 0x3ff;

const FIELDS = 2;

/** Does the firmware's `help` reply list the conditional layers command? */
export const hasConditionalLayersCommand = (help: unknown): boolean => {
  if (typeof help !== "string") {
    return false;
  }

  return help.split(/\r?\n/).some(line => line.trim() === CONDITIONAL_LAYERS_COMMAND);
};

/** The rules in a `conditional.map` reply, or null when the reply is not one. */
export const parseConditionalLayersRaw = (raw: unknown): ConditionalLayerRule[] | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const tokens = raw.trim().split(/\s+/);

  if (!tokens.every(token => /^\d+$/.test(token))) {
    return null;
  }

  const values = tokens.map(token => parseInt(token, 10));
  const count = values[0];

  if (count > MAX_CONDITIONAL_LAYERS || values.length !== 1 + FIELDS * count || values.some(v => v > 0xffff)) {
    return null;
  }

  const list: ConditionalLayerRule[] = [];

  for (let i = 0; i < count; i += 1) {
    const [ifMask, thenLayer] = values.slice(1 + FIELDS * i, 1 + FIELDS * (i + 1));

    /* The firmware stores the then-layer in a byte */
    if (thenLayer > 0xff) {
      return null;
    }

    list.push({ ifMask, thenLayer });
  }

  return list;
};

export const serializeConditionalLayers = (list: ConditionalLayerRule[]): string => {
  const values = [list.length];

  list.forEach(r => {
    values.push(r.ifMask, r.thenLayer);
  });

  return values.join(" ");
};

/** The number of layers in a mask. */
export const layerBits = (mask: number): number => {
  let bits = 0;

  for (let rest = mask; rest !== 0; rest >>>= 1) {
    bits += rest & 1;
  }

  return bits;
};

/** Mirror of ConditionalLayersDygma::ruleAllowed. Why the firmware would reject `r`, or null when it accepts it. */
export const validateConditionalLayer = (r: ConditionalLayerRule): string | null => {
  if (!Number.isInteger(r.ifMask) || r.ifMask < 0 || (r.ifMask & ~CL_LAYERS_MASK) !== 0) {
    return `the if-layer mask ${r.ifMask} has a layer above ${CL_LAYER_COUNT}`;
  }

  if (layerBits(r.ifMask) < 2) {
    return "a rule needs at least two if-layers";
  }

  if (!Number.isInteger(r.thenLayer) || r.thenLayer < 0 || r.thenLayer >= CL_LAYER_COUNT) {
    return `the then-layer ${r.thenLayer} is not a layer from 0 to ${CL_LAYER_COUNT - 1}`;
  }

  if ((r.ifMask & (1 << r.thenLayer)) !== 0) {
    return "the then-layer is also an if-layer";
  }

  return null;
};

/** Mirror of ConditionalLayersDygma::tableAllowed. Why the firmware would reject `list`, or null when it accepts it. */
export const validateConditionalLayers = (list: ConditionalLayerRule[]): string | null => {
  if (list.length > MAX_CONDITIONAL_LAYERS) {
    return `more than ${MAX_CONDITIONAL_LAYERS} rules`;
  }

  for (let i = 0; i < list.length; i += 1) {
    const invalid = validateConditionalLayer(list[i]);

    if (invalid !== null) {
      return `rule ${i}: ${invalid}`;
    }

    for (let j = 0; j < i; j += 1) {
      if (list[j].ifMask === list[i].ifMask && list[j].thenLayer === list[i].thenLayer) {
        return `rule ${i}: repeats rule ${j}`;
      }
    }
  }

  return null;
};

/** A new rule, layers 2 and 3 turn on layer 4 in Bazecor's labels. */
export const newConditionalLayer = (): ConditionalLayerRule => ({ ifMask: 0x006, thenLayer: 3 });

/** Flip one if-layer. Keep the rule unchanged for the then-layer, a layer out of range, or a change that leaves fewer than two if-layers. */
export const toggleIfLayer = (rule: ConditionalLayerRule, layer: number): ConditionalLayerRule => {
  if (!Number.isInteger(layer) || layer < 0 || layer >= CL_LAYER_COUNT || layer === rule.thenLayer) {
    return rule;
  }

  const bit = 1 << layer;

  if ((rule.ifMask & bit) !== 0 && layerBits(rule.ifMask) <= 2) {
    return rule;
  }

  return { ...rule, ifMask: rule.ifMask ^ bit };
};

/** The layers the rule can turn on, every layer that is not one of its if-layers. */
export const thenLayerOptions = (rule: ConditionalLayerRule): number[] =>
  Array.from({ length: CL_LAYER_COUNT }, (_, layer) => layer).filter(layer => (rule.ifMask & (1 << layer)) === 0);

/** The first earlier rule identical to the one at `index`, or -1. The firmware rejects a table with one. */
export const duplicateOf = (list: ConditionalLayerRule[], index: number): number => {
  const r = list[index];

  if (!r) {
    return -1;
  }

  return list.slice(0, index).findIndex(earlier => earlier.ifMask === r.ifMask && earlier.thenLayer === r.thenLayer);
};

/** True when a restore must clear the rules, because the keyboard has them and the backup does not. */
export const needsConditionalLayersClear = (commands: string[], supported: Set<string> | null): boolean =>
  supported !== null && supported.has(CONDITIONAL_LAYERS_COMMAND) && !commands.includes(CONDITIONAL_LAYERS_COMMAND);

/* ------------------------------------------------------------------------ */
/* Keyboard I/O                                                             */
/* ------------------------------------------------------------------------ */

export interface ConditionalLayersDevice {
  noCacheCommand(cmd: string, ...args: string[]): Promise<unknown>;
}

/** The rules on the keyboard, or null when they could not be read. */
export const readConditionalLayers = async (device: ConditionalLayersDevice): Promise<ConditionalLayerRule[] | null> => {
  try {
    return parseConditionalLayersRaw(await device.noCacheCommand(CONDITIONAL_LAYERS_COMMAND));
  } catch (error) {
    return null;
  }
};

/** Write the rules and read them back. Throw unless the keyboard holds exactly what was sent. */
export const writeConditionalLayers = async (device: ConditionalLayersDevice, list: ConditionalLayerRule[]): Promise<void> => {
  const invalid = validateConditionalLayers(list);

  if (invalid !== null) {
    throw new Error(`Conditional layers not sent: ${invalid}`);
  }

  const sent = serializeConditionalLayers(list);
  let stored: ConditionalLayerRule[] | null;

  try {
    const written = await device.noCacheCommand(CONDITIONAL_LAYERS_COMMAND, sent);

    if (written instanceof Error) {
      throw written;
    }

    /* Trust no other reply, since the virtual keyboard echoes the payload. The read-back decides */
    if (typeof written === "string" && written.trim() === "error") {
      throw new Error("The keyboard rejected the conditional layers");
    }

    const reply = await device.noCacheCommand(CONDITIONAL_LAYERS_COMMAND);

    if (reply instanceof Error) {
      throw reply;
    }

    stored = parseConditionalLayersRaw(reply);
  } catch (error) {
    /* Device caches the table it sent. Read what the keyboard holds, so a later backup does not record the unsent table */
    try {
      await device.noCacheCommand(CONDITIONAL_LAYERS_COMMAND);
    } catch (refreshError) {
      /* Keep the write's own error */
    }

    throw error;
  }

  /* The read-back already put the keyboard's table in the cache */
  if (stored === null || serializeConditionalLayers(stored) !== sent) {
    throw new Error("The keyboard did not store the conditional layers");
  }
};

/** Restore a `conditional.map` backup entry. */
export const restoreConditionalLayers = async (device: ConditionalLayersDevice, data: string): Promise<void> => {
  const list = parseConditionalLayersRaw(data);

  if (list === null) {
    throw new Error(`Malformed ${CONDITIONAL_LAYERS_COMMAND} backup entry`);
  }

  await writeConditionalLayers(device, list);
};
