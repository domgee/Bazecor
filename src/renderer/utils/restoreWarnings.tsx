import React from "react";
import { toast } from "react-toastify";
import { i18n } from "@Renderer/i18n";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import { IconArrowDownWithLine } from "@Renderer/components/atoms/icons";
import Backup from "../../api/backup";
import { MACROS_NOT_RESTORED } from "../../api/parsers/macros";
import { HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED } from "../../api/parsers/holdMods";

const warningText = (warning: string) => {
  const { backupFolder } = i18n.keyboardSettings;
  const texts: Record<string, string> = {
    [MACROS_NOT_RESTORED]: backupFolder.macrosNotRestored,
    [HOLD_MODS_NORMALIZED]: backupFolder.holdModsNormalized,
    [HOLD_MODS_NOT_RESTORED]: backupFolder.holdModsNotRestored,
  };
  return texts[warning] ?? warning;
};

/** Show a toast for each command the last restore skipped */
const showRestoreWarnings = () => {
  Backup.takeRestoreWarnings().forEach(warning => {
    toast.warn(
      <ToastMessage
        title={i18n.keyboardSettings.backupFolder.restoreWarningTitle}
        content={warningText(warning)}
        icon={<IconArrowDownWithLine />}
      />,
      {
        autoClose: false,
        icon: "",
      },
    );
  });
};

export default showRestoreWarnings;
