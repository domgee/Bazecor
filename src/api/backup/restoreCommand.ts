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

import { HoldModsTarget } from "@Renderer/types/holdMods";
import {
  ALT_REPEAT_COMMAND,
  AltRepeatDevice,
  parseAltRepeatRaw,
  restoreAltRepeat,
  serializeAltRepeat,
} from "../parsers/altRepeat";
import { KEY_OVERRIDES_COMMAND, restoreKeyOverrides } from "../parsers/keyOverrides";
import { LED_CUSTOM_COMMAND, restoreLedCustom } from "../parsers/ledCustom";
import { QUICK_TAP_COMMAND, restoreQuickTap } from "../parsers/quickTap";
import { CONDITIONAL_LAYERS_COMMAND, restoreConditionalLayers } from "../parsers/conditionalLayers";
import {
  DUAL_FUNCTION_COMMAND,
  PER_KEY_COMMAND,
  restoreDualFunctionGlobals,
  restorePerKeyOverrides,
} from "../parsers/dualFunction";
import { MACROS_COMMAND, restoreMacrosMap } from "../parsers/macros";
import {
  HOLD_MODS_COMMAND,
  HOLD_MODS_NORMALIZED,
  plainHoldOutputs,
  restoreHoldKeymap,
  restoreHoldMods,
} from "../parsers/holdMods";

/** Restore the previous-key rules, with partial hold outputs made plain when the target does not list the held modifiers table. */
const restoreAltRepeatHolds = async (
  device: AltRepeatDevice,
  data: string,
  keysPerLayer: number,
  holdModsTarget: HoldModsTarget,
): Promise<string | undefined> => {
  const rules = holdModsTarget === "listed" ? null : parseAltRepeatRaw(data);
  const plain = rules === null ? null : plainHoldOutputs(rules);

  if (plain === null || plain === rules) {
    await restoreAltRepeat(device, data, keysPerLayer);
    return undefined;
  }

  await restoreAltRepeat(device, serializeAltRepeat(plain), keysPerLayer);
  return HOLD_MODS_NORMALIZED;
};

/** Restore one backup command. Validate and read back the previous-key rules, the key overrides, the conditional layers, the quick tap
 * term, the dual-function options, the custom LED effects and the held modifiers, whose rejection must fail the restore. Skip macros that
 * use steps the keyboard lacks. Check the keymap write on a target with the held modifiers table, and make partial holds plain on any other
 * target. Send the rest plain. `keysPerLayer` runs only for the previous-key rules, so a plain command never needs the keyboard's layout.
 * `holdModsTarget` is the target's `help` classified once per restore. Return a warning for the user when a command was skipped or changed. */
export const restoreCommand = async (
  device: AltRepeatDevice,
  command: string,
  data: string,
  keysPerLayer: () => number,
  sendPlain: () => Promise<unknown>,
  holdModsTarget: HoldModsTarget,
): Promise<string | undefined> => {
  if (command === MACROS_COMMAND) {
    return restoreMacrosMap(device, data, sendPlain);
  }

  if (command === "keymap.custom") {
    return restoreHoldKeymap(device, data, holdModsTarget, sendPlain);
  }

  if (command === HOLD_MODS_COMMAND) {
    return restoreHoldMods(device, data, holdModsTarget);
  }

  if (command === ALT_REPEAT_COMMAND) {
    return restoreAltRepeatHolds(device, data, keysPerLayer(), holdModsTarget);
  }

  if (command === KEY_OVERRIDES_COMMAND) {
    await restoreKeyOverrides(device, data);
    return undefined;
  }

  if (command === LED_CUSTOM_COMMAND) {
    await restoreLedCustom(device, data);
    return undefined;
  }

  if (command === CONDITIONAL_LAYERS_COMMAND) {
    await restoreConditionalLayers(device, data);
    return undefined;
  }

  if (command === QUICK_TAP_COMMAND) {
    await restoreQuickTap(device, data);
    return undefined;
  }

  if (command === DUAL_FUNCTION_COMMAND) {
    await restoreDualFunctionGlobals(device, data);
    return undefined;
  }

  if (command === PER_KEY_COMMAND) {
    await restorePerKeyOverrides(device, data);
    return undefined;
  }

  await sendPlain();
  return undefined;
};

export default restoreCommand;
