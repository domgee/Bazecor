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

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@Renderer/components/atoms/Dialog";
import { Button } from "@Renderer/components/atoms/Button";
import { i18n } from "@Renderer/i18n";
import { Picker } from "@Renderer/modules/KeyPickerKeyboard";
import ModPicker from "@Renderer/modules/KeyPickerKeyboard/ModPicker";
import PreviousKeyLabel from "@Renderer/modules/AltRepeat/PreviousKeyLabel";
import { KeymapDB } from "../../../api/keymap";
import { isValidReplacement, splitTriggerCode } from "../../../api/parsers/keyOverrides";
import ReplacementLabel from "./ReplacementLabel";

export type KeyOverrideKeyMode = "trigger" | "replacement";

interface KeyOverrideKeyDialogProps {
  open: boolean;
  mode: KeyOverrideKeyMode;
  /** The key being changed, 0 for none yet. */
  initialCode: number;
  keymapDB: KeymapDB;
  selectedlanguage: string;
  onConfirm: (code: number) => void;
  onCancel: () => void;
}

/* The trigger as the firmware matches it, AltGr folded into Alt, or -1 when the code can not be one */
const triggerOf = (code: number): number => {
  const split = splitTriggerCode(code);
  return split === null ? -1 : (split.triggerMods << 8) | split.trigger;
};

/** Pick a key, then its modifiers. A trigger takes no AltGr, since the firmware ignores the side. A replacement can also block. */
const KeyOverrideKeyDialog = (props: KeyOverrideKeyDialogProps) => {
  const { open, mode, initialCode, keymapDB, selectedlanguage, onConfirm, onCancel } = props;
  const strings = i18n.editor.keyOverrides;
  const [localCode, setLocalCode] = useState(initialCode);

  /* Reset on a mode change too, since adding goes from the trigger straight to the output in the same open dialog */
  useEffect(() => {
    if (open) {
      setLocalCode(initialCode);
    }
  }, [open, mode, initialCode]);

  const isTrigger = mode === "trigger";
  const result = isTrigger ? triggerOf(localCode) : localCode;
  const valid = localCode !== 0 && (isTrigger ? result >= 0 : isValidReplacement(localCode));
  const segment = keymapDB.keySegmentor(localCode);
  let hint = isTrigger ? strings.triggerHint : strings.replacementHint;

  if (localCode !== 0 && !valid) {
    hint = isTrigger ? strings.triggerInvalid : strings.replacementInvalid;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{isTrigger ? strings.triggerTitle : strings.replacementTitle}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 mt-2 flex flex-col gap-3">
          <p className={localCode !== 0 && !valid ? "text-red-200" : ""}>{hint}</p>
          <Picker
            onKeySelect={setLocalCode}
            baseCode={segment.base}
            modCode={segment.modified}
            disable={false}
            disableMods
            disableMove={false}
            selectedlanguage={selectedlanguage}
          />
          <div className="flex flex-wrap items-center justify-between gap-6">
            <ModPicker
              keyCode={segment}
              onKeySelect={setLocalCode}
              isStandardView={false}
              allowAutoshift={false}
              allowLayerHold={false}
              allowAltGr={!isTrigger}
              idPrefix={isTrigger ? "koTrigger-" : "koReplacement-"}
            />
            {valid && (
              <span className="font-semibold">
                {isTrigger ? (
                  <PreviousKeyLabel code={result} keymapDB={keymapDB} />
                ) : (
                  <ReplacementLabel code={result} keymapDB={keymapDB} />
                )}
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
          {!isTrigger && (
            <Button variant="outline" size="md" onClick={() => onConfirm(0)}>
              {strings.blockButton}
            </Button>
          )}
          <Button variant="outline" size="md" onClick={onCancel}>
            {strings.cancel}
          </Button>
          <Button variant="secondary" size="md" disabled={!valid} onClick={() => onConfirm(result)}>
            {strings.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default KeyOverrideKeyDialog;
