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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@Renderer/components/atoms/Dialog";
import { Button } from "@Renderer/components/atoms/Button";
import { i18n } from "@Renderer/i18n";
import { AltRepeatBlock } from "@Renderer/types/altRepeat";

interface AltRepeatBreakDialogProps {
  open: boolean;
  reason: AltRepeatBlock | null;
  ruleCount: number;
  onUndo: () => void;
  onKeep: () => void;
}

/** Warns that the key just assigned turns off the previous-key tabs on its position. */
export const AltRepeatBreakDialog = (props: AltRepeatBreakDialogProps): JSX.Element => {
  const { open, reason, ruleCount, onUndo, onKeep } = props;
  const strings = i18n.editor.altRepeat;

  return (
    <Dialog open={open} onOpenChange={onKeep}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{strings.breakModal.title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 mt-2 flex flex-col gap-3">
          {reason !== null && <p>{strings.blocked[reason]}</p>}
          <p className="font-semibold">{`A${ruleCount}`}</p>
          <p className="text-gray-400 dark:text-gray-200">{strings.breakModal.body}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="md" onClick={onKeep}>
            {strings.breakModal.keep}
          </Button>
          <Button variant="secondary" size="md" onClick={onUndo}>
            {strings.breakModal.undo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AltRepeatBreakDialog;
