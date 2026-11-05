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
import { KeymapDB } from "../../../api/keymap";
import { isValidPrevious, normalizePrevious } from "../../../api/parsers/altRepeat";
import PreviousKeyLabel from "./PreviousKeyLabel";

interface PreviousKeyDialogProps {
  open: boolean;
  /** The previous key being changed, 0 for a new tab. */
  initialCode: number;
  /** Previous keys of the key's other tabs. */
  takenCodes: number[];
  keymapDB: KeymapDB;
  selectedlanguage: string;
  onConfirm: (code: number) => void;
  onCancel: () => void;
}

/** Pick the key, then its modifiers. The firmware matches the exact modifier set with the side ignored, so there is no AltGr. */
const PreviousKeyDialog = (props: PreviousKeyDialogProps) => {
  const { open, initialCode, takenCodes, keymapDB, selectedlanguage, onConfirm, onCancel } = props;
  const strings = i18n.editor.altRepeat;
  const [localCode, setLocalCode] = useState(initialCode);

  useEffect(() => {
    if (open) {
      setLocalCode(initialCode);
    }
  }, [open, initialCode]);

  const previous = normalizePrevious(localCode);
  const valid = isValidPrevious(previous);
  const taken = valid && takenCodes.includes(previous);
  const segment = keymapDB.keySegmentor(localCode);
  let hint = strings.previousHint;

  if (localCode !== 0 && !valid) {
    hint = strings.previousModifierOnly;
  } else if (taken) {
    hint = strings.previousDuplicate;
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
          <DialogTitle>{strings.previousTitle}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 mt-2 flex flex-col gap-3">
          <p className={localCode !== 0 && (!valid || taken) ? "text-red-200" : ""}>{hint}</p>
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
              allowAltGr={false}
            />
            {valid && (
              <span className="font-semibold">
                <PreviousKeyLabel code={previous} keymapDB={keymapDB} />
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="md" onClick={onCancel}>
            {strings.cancel}
          </Button>
          <Button variant="secondary" size="md" disabled={!valid || taken} onClick={() => onConfirm(previous)}>
            {strings.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PreviousKeyDialog;
