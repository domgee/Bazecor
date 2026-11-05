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

import React from "react";

/** A key override. The trigger key with the required modifiers held sends the replacement instead. */
export interface KeyOverride {
  /** HID keycode 0x04..0xDD. */
  trigger: number;
  /** Required modifiers, Ctrl 1, Alt 2, Shift 8 and Gui 16, side ignored. */
  triggerMods: number;
  /** Bit n allows firmware layer n, layers 0-9. */
  layers: number;
  /** Modifiers that keep the override off, never one of the required ones. */
  negativeMods: number;
  /** Modifiers taken out of the report while the override is active. */
  suppressedMods: number;
  /** 0 blocks the key, else Ctrl, Alt, AltGr, Shift and Gui flags << 8 plus a keycode 0x04..0xDD. */
  replacement: number;
  /** QMK ko_option_t bits. */
  options: number;
  enabled: boolean;
}

/** "failed" means the firmware has the command but its overrides could not be read. */
export type KeyOverridesState = "unsupported" | "ready" | "failed";

export interface KeyOverridesEditorProps {
  onDisconnect: () => void;
  startContext: () => void;
  cancelContext: () => void;
  setLoading: (loading: boolean) => void;
  saveButtonRef?: React.RefObject<HTMLButtonElement>;
  discardChangesButtonRef?: React.RefObject<HTMLButtonElement>;
}
