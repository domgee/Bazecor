import React, { useMemo, useState, useEffect } from "react";
import { toast } from "react-toastify";
import log from "electron-log/renderer";

import { Button } from "@Renderer/components/atoms/Button";
import Heading from "@Renderer/components/atoms/Heading";
import findModifierType from "@Renderer/utils/findModifierType";
import OSKey from "@Renderer/components/molecules/KeyTags/OSKey";
import { IconWarning } from "@Renderer/components/atoms/icons";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import CustomRadioCheckBox from "@Renderer/components/molecules/Form/CustomRadioCheckBox";
import { SegmentedKeyType } from "@Renderer/types/layout";
import Store from "@Renderer/utils/Store";
import { CapsWordCodes } from "../../../hw/capsword";
import { RepeatKeyCodes } from "../../../hw/repeatkey";

interface ModifiersTabProps {
  keyCode: SegmentedKeyType;
  onKeySelect: (value: number) => void;
  disabled?: boolean;
  baseCode?: number;
  modCode?: number;
  selectedlanguage?: string;
  activeTab?: string;
  action?: number;
}

const ModifiersTab = ({
  keyCode,

  onKeySelect,
  disabled,
  activeTab,
  action,
}: ModifiersTabProps) => {
  // OneShot modifiers rely on their own tap/hold/double-tap timing, which conflicts
  // with the Tap action slot of a Superkey, so it's not offered there.
  const isSuperkeyTap = activeTab === "super" && action === 0;
  const [activeModifier, setActiveModifier] = useState<string>("");
  const [activeModifierTab, setActiveModifierTab] = useState<string>("None");
  const store = Store.getStore();
  const capsword = Boolean(store.get("capabilities.capsword"));
  const repeatKey = Boolean(store.get("capabilities.repeatKey"));

  const KC = useMemo(() => {
    if (keyCode?.base !== undefined && keyCode?.modified !== undefined) {
      return keyCode.base + keyCode.modified;
    }
    return undefined;
  }, [keyCode]);

  let isDualModifier = false;

  if (
    keyCode.modified === 49425 ||
    keyCode.modified === 49169 ||
    keyCode.modified === 49937 ||
    keyCode.modified === 49681 ||
    keyCode.modified === 50705
  ) {
    isDualModifier = true;
  }

  let keyNumInternal: number;
  if (typeof KC === "number" && !isDualModifier) {
    keyNumInternal = KC;
  } else if (typeof KC === "number" && isDualModifier) {
    keyNumInternal = keyCode.modified;
  } else {
    keyNumInternal = 0;
  }

  const triggerToast = () => {
    toast.warn(
      <ToastMessage
        icon={<IconWarning />}
        title="Select a modifier first"
        content="Please select a modifier key before proceeding. Modifiers, like Shift or Ctrl, are required to complete this action."
      />,
      {
        autoClose: 3000,
        icon: "",
      },
    );
  };

  const handleModifier = (modifier: string) => {
    /* Dual-function keys are set up in the Multi-action tab, so a modifier picked here on one becomes a plain modifier */
    const modifierTab = activeModifierTab === "dualModifier" ? "None" : activeModifierTab;
    const modifierItem = findModifierType(undefined, modifierTab, modifier);
    setActiveModifier(modifier);
    setActiveModifierTab(modifierTab);
    log.info(modifier, modifierItem);
    if (modifierItem) {
      onKeySelect(modifierItem.keynum);
    }
  };

  useEffect(() => {
    const modifierItem = findModifierType(undefined, activeModifierTab, activeModifier);
    if (modifierItem && modifierItem.type !== "dualModifier") {
      onKeySelect(modifierItem.keynum);
    }
    // eslint-disable-next-line
  }, [activeModifierTab]);

  useEffect(() => {
    const modifierItem = findModifierType(keyNumInternal);

    if (modifierItem) {
      setActiveModifierTab(modifierItem?.type);
      setActiveModifier(modifierItem?.modifier);
    } else {
      setActiveModifierTab("None");
      setActiveModifier("");
    }

    // eslint-disable-next-line
  }, [keyNumInternal]);

  const modifiersButtons = useMemo(
    () => [
      {
        id: 1,
        label: "Shift",
        identifier: "shift",
        renderElement: <OSKey renderKey="shift" size="sm" />,
        keyNumMod: 225,
      },
      {
        id: 2,
        label: "Control",
        identifier: "control",
        renderElement: <OSKey renderKey="control" size="sm" />,
        keyNumMod: 224,
      },
      {
        id: 3,
        label: "OS",
        identifier: "os",
        renderElement: <OSKey renderKey="os" size="sm" />,
        keyNumMod: 227,
      },
      {
        id: 4,
        label: "Alt",
        identifier: "alt",
        renderElement: <OSKey renderKey="alt" size="sm" />,
        keyNumMod: 226,
      },
      {
        id: 5,
        label: "Right Shift",
        identifier: "rshift",
        renderElement: <OSKey renderKey="shift" size="sm" />,
        keyNumMod: 229,
      },
      {
        id: 6,
        label: "Right Control",
        identifier: "rcontrol",
        renderElement: <OSKey renderKey="control" size="sm" />,
        keyNumMod: 228,
      },
      {
        id: 7,
        label: "Right OS",
        identifier: "ros",
        renderElement: <OSKey renderKey="os" size="sm" />,
        keyNumMod: 231,
      },
      {
        id: 7,
        label: "Alt Gr.",
        identifier: "altGr",
        renderElement: <OSKey renderKey="altGr" size="sm" />,
        keyNumMod: 230,
      },
    ],
    [],
  );

  return (
    <div className={`flex flex-wrap h-[inherit] ${disabled ? "opacity-50 pointer-events-none" : ""} tabsLayer`}>
      <div className="tabContentWrapper w-full">
        <div className="w-full flex flex-col gap-2">
          <div className="w-full flex flex-row flex-wrap gap-6">
            <div className="flex flex-col gap-2">
              <Heading renderAs="h4" headingLevel={3} className="text-base flex leading-6 gap-1 pt-4">
                {activeModifierTab === "None" && <>Select a Modifier</>}
                {activeModifierTab === "dualModifier" && (
                  <>
                    Modifier{" "}
                    <span className="text-gray-400 dark:text-gray-300 gap-1 inline-flex leading-6 align-text-bottom">
                      on hold
                    </span>
                  </>
                )}
                {activeModifierTab === "oneShotModifier" && (
                  <>
                    Modifier <span className="text-gray-400 dark:text-gray-300">OneShot</span>
                  </>
                )}
              </Heading>
              <div className="flex flex-wrap gap-1 items-center">
                {modifiersButtons.map((button, index) => (
                  <div key={`keyIs ${button} + ${String(index)}`}>
                    {index === 0 && <span className="text-sm mr-1 text-gray-500 dark:text-gray-300">Left</span>}
                    {index === 4 && <span className="text-sm ml-2 mr-1 text-gray-500 dark:text-gray-300">Right</span>}
                    <Button
                      variant="config"
                      onClick={() => {
                        handleModifier(button.identifier);
                      }}
                      selected={activeModifier === button.identifier}
                      size="sm"
                      className="min-w-16 text-ssm h-9"
                      key={`button-key-${button.identifier}`}
                    >
                      {button.renderElement}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            {capsword && (
              <div className="basis-full flex flex-col gap-2">
                <Heading renderAs="h4" headingLevel={3} className="text-base flex leading-6 gap-1">
                  CapsWord
                </Heading>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant="config"
                    onClick={() => {
                      log.info(`[CapsWord] assigning key: ${CapsWordCodes.CAPS_WORD} (previous keycode ${KC})`);
                      onKeySelect(CapsWordCodes.CAPS_WORD);
                    }}
                    selected={KC === CapsWordCodes.CAPS_WORD}
                    size="sm"
                    className="min-w-16 text-ssm h-9"
                  >
                    CapsWord
                  </Button>
                  <p className="description text-ssm font-medium text-gray-400 dark:text-gray-300 max-w-md">
                    After you press this key, the next word will be capitalized. You can also deactivate it by pressing the key
                    again.
                  </p>
                </div>
              </div>
            )}
            {repeatKey && (
              <div className="basis-full flex flex-col gap-2">
                <Heading renderAs="h4" headingLevel={3} className="text-base flex leading-6 gap-1">
                  Repeat key
                </Heading>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    variant="config"
                    onClick={() => {
                      log.info(`[RepeatKey] assigning key: ${RepeatKeyCodes.REPEAT_KEY} (previous keycode ${KC})`);
                      onKeySelect(RepeatKeyCodes.REPEAT_KEY);
                    }}
                    selected={KC === RepeatKeyCodes.REPEAT_KEY}
                    size="sm"
                    className="min-w-16 text-ssm h-9"
                  >
                    Repeat
                  </Button>
                  <p className="description text-ssm font-medium text-gray-400 dark:text-gray-300 max-w-md">
                    Sends the last key you typed again, with its modifiers. Modifiers you hold add to it. Hold it to repeat.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex flex-wrap gap-6">
              {!isSuperkeyTap && (
                <CustomRadioCheckBox
                  label={<div className="pl-0.5">Turn into a OneShot modifier</div>}
                  checked={activeModifierTab === "oneShotModifier"}
                  onClick={() => {
                    if (activeModifier === "") {
                      triggerToast();
                    } else {
                      setActiveModifierTab(previous => (previous === "oneShotModifier" ? "None" : "oneShotModifier"));
                      // setActiveModifierTab("oneShotModifier");
                    }
                  }}
                  type="radio"
                  name="addOneShotModifier"
                  id="addOneShotModifier"
                  tooltip={
                    <>
                      <Heading
                        headingLevel={4}
                        renderAs="h4"
                        className="text-gray-600 dark:text-gray-25 mb-1 leading-6 text-base"
                      >
                        OneShot Modifier
                      </Heading>
                      <p className="description text-ssm font-medium text-gray-400 dark:text-gray-200">
                        Tap the key to use the selected modifier for a single keypress; after that keypress, the software
                        automatically deactivates the modifier. You can also hold the key to use the modifier normally. Double-tap
                        it to lock the modifier; tap it again to unlock it.
                      </p>
                    </>
                  }
                  className="self-start mt-0"
                  disabled={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModifiersTab;
