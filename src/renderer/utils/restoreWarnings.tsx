import React from "react";
import { toast } from "react-toastify";
import { i18n } from "@Renderer/i18n";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import { IconArrowDownWithLine } from "@Renderer/components/atoms/icons";
import Backup from "../../api/backup";
import { MACROS_NOT_RESTORED } from "../../api/parsers/macros";

const warningText = (warning: string) =>
  warning === MACROS_NOT_RESTORED ? i18n.keyboardSettings.backupFolder.macrosNotRestored : warning;

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
