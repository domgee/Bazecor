// -*- mode: js-jsx -*-
/* Bazecor
 * Copyright (C) 2024  DygmaLab SE.
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
import Styled from "styled-components";

// Custom components
import { Card, CardContent, CardHeader, CardTitle } from "@Renderer/components/atoms/Card";
import { KBDataPref } from "@Renderer/types/preferences";
import { MAX_COMBO_IDLE_TIME, MAX_COMBO_WINDOW, MIN_COMBO_WINDOW } from "@Renderer/types/combos";
import {
  IconTypo,
  IconMouse,
  IconInformation,
  IconThunder,
  IconLayerShift,
  IconKeyboard,
} from "@Renderer/components/atoms/icons";
import { Slider } from "@Renderer/components/atoms/slider";
import { Switch } from "@Renderer/components/atoms/Switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import Heading from "@Renderer/components/atoms/Heading";
import Store from "@Renderer/utils/Store";

// Assets
import { i18n } from "@Renderer/i18n";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@Renderer/components/atoms/Tooltip";
import {
  DualFunctionGlobals,
  FLOW_TERM_MAX,
  MODE_HOLD_ON_OTHER_KEY,
  MODE_PERMISSIVE,
  MODE_TIMEOUT_ONLY,
  NEUTRALIZER_OPTIONS,
} from "../../../api/parsers/dualFunction";

const Styles = Styled.div`

  .slider{
    width: 100%;
  }
  .greytext{
    color: ${({ theme }) => theme.colors.button.background};
  }
  .dropdownMenu{
    position: absolute;
  }
  .overflowFix{
    overflow: inherit;
  }
  .overflowFix::-webkit-scrollbar {
    display: none;
  }
  .dygmaLogo {
    height: 26px;
    width: 26px;
    margin-right 0.5em;
  }
  .fullWidth {
    button {
      width: -webkit-fill-available;
    }
  }
  .va3fix {
    vertical-align: -3px;
  }
  .va2fix {
    vertical-align: -2px;
  }
  .va1fix {
    vertical-align: -1px;
  }
  .backupbuttons {
    margin: 0;
    padding: 0.44em;
    width: -webkit-fill-available;
  }
  .devfix {
    display: flex;
    justify-content: space-evenly;
  }
  .modinfo {
    font-size: 1rem;
    margin-left: 0.3em;
    color: ${({ theme }) => theme.colors.tipIcon};
  }
  .save-holder {
    position: fixed;
    height: 40px;
    bottom: 40px;
    right: 40px;
  }
  .select-icon {
    position: absolute;
    left: 8px;
    top: 13px;
    background-color: ${({ theme }) => theme.colors.button.deselected};
    border: 2px solid ${({ theme }) => theme.colors.button.deselected};
    color: ${({ theme }) => theme.colors.button.text};
    font-size: 1.3em;
    border-radius: 4px;
  }
  .delete-icon {
    font-size: 1.5rem;
    vertical-align: text-top;
  }
  .align-left {
    float: right;
    margin-top: 6px;
  }
  .neuronToggler{
    text-align: left;
    line-height: 1.8em;
    letter-spacing: 0.02em;
    button.btn.btn-error {
      line-height: 1.8em;
      float: right;
      :hover {
        background-color: #c75454;
      }
    }
  }
  .neuronName{
    .nTitle span{
      line-height: 2.8rem;
      white-space: nowrap;
    }
    .nControl input{
      margin-top: 5px;
      line-height: 2.3rem;
    }
    .nButton button{
    line-height: 1.7rem;
    }
  }
  .neuron-lh{
    line-height: 2.4rem;
  }
  .deleteButton {
    min-width: 100%;
    :hover {
      color: inherit;
    }
  }
  .successButton {
    min-width: 100%;
  }
  .accSpan {
    cursor: pointer;
  }
`;

interface OptionHeadingProps {
  label: string;
  tip: string;
  points: string[];
}

function OptionHeading({ label, tip, points }: OptionHeadingProps) {
  return (
    <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
      {label}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
            <IconInformation />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
              {tip}
            </Heading>
            {points.length > 0 && (
              <ul className="list-disc pl-4">
                {points.map(point => (
                  <li key={point} className="text-left">
                    {point}
                  </li>
                ))}
              </ul>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Heading>
  );
}

interface KeyboardSettingsProps {
  kbData: KBDataPref;
  setKbData: (data: KBDataPref) => void;
  connected: boolean;
}

function KeyboardSettings(props: KeyboardSettingsProps) {
  const { kbData, setKbData, connected } = props;
  const [localKBData, setLocalKBData] = useState(kbData);
  const store = Store.getStore();
  const sk20Raw = store.get("capabilities.sk20");
  const sk20 = sk20Raw === true || sk20Raw === "true" || sk20Raw === 1 || sk20Raw === "1";
  const labelWithFastSuper = (text: string) => (sk20 ? text.replace("Add Key on Tap", "Superkeys") : text);
  // Firmware older than the one that ships these features doesn't know their commands
  const autoshift = Boolean(store.get("capabilities.autoshift"));
  const combos = Boolean(store.get("capabilities.combos"));
  const capsword = Boolean(store.get("capabilities.capsword"));
  const quickTap = Boolean(store.get("capabilities.quickTap"));
  const dualFunctionCapable = Boolean(store.get("capabilities.dualFunction"));
  const qukeysLabel = (text: string) =>
    sk20 ? labelWithFastSuper(text).replace("Superkeys - ", "").trim() : labelWithFastSuper(text);

  useEffect(() => {
    const { kbData: newKBData } = props;
    setLocalKBData(newKBData);
  }, [props, setKbData]);

  const setHoldTimeout = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      qukeysHoldTimeout: value[0],
      SuperHoldstart: sk20 ? value[0] : data.SuperHoldstart,
    }));
    setKbData({
      ...localKBData,
      qukeysHoldTimeout: value[0],
      SuperHoldstart: sk20 ? value[0] : localKBData.SuperHoldstart,
    });
  };

  const setOverlapThreshold = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      qukeysOverlapThreshold: value[0],
    }));
    setKbData({ ...localKBData, qukeysOverlapThreshold: value[0] });
  };

  const setMinHold = (value: number[]) => {
    const clamped = value[0] > 255 ? 255 : value[0];
    setLocalKBData(data => ({
      ...data,
      qukeysMinHold: clamped,
    }));
    setKbData({ ...localKBData, qukeysMinHold: clamped });
  };

  const setMinPrior = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      qukeysMinPrior: value[0],
    }));
    setKbData({ ...localKBData, qukeysMinPrior: value[0] });
  };

  const setQuickTapTerm = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      qukeysQuickTapTerm: value[0],
    }));
    setKbData({ ...localKBData, qukeysQuickTapTerm: value[0] });
  };

  /* Keep a neutralizer the list lacks, such as one set through Focus, selectable as its keycode */
  const neutralizerOptions = (current: number) => {
    const options = NEUTRALIZER_OPTIONS.map(option =>
      option.value === 0 ? { ...option, label: i18n.keyboardSettings.qukeys.dualFunctionOff } : option,
    );

    if (options.some(option => option.value === current)) {
      return options;
    }

    const hex = current.toString(16).toUpperCase().padStart(2, "0");
    return [...options, { value: current, label: `${i18n.keyboardSettings.qukeys.neutralizerKeycode} 0x${hex}` }];
  };

  const setDualFunction = (patch: Partial<DualFunctionGlobals>) => {
    if (localKBData.dualFunction === null) {
      return;
    }

    const dualFunction = { ...localKBData.dualFunction, ...patch };
    setLocalKBData(data => ({ ...data, dualFunction }));
    setKbData({ ...localKBData, dualFunction });
  };

  const setSuperTimeout = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      SuperTimeout: value[0],
    }));
    setKbData({ ...localKBData, SuperTimeout: value[0] });
  };

  const setSuperHoldstart = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      SuperHoldstart: value[0],
    }));
    setKbData({ ...localKBData, SuperHoldstart: value[0] });
  };

  const setAutoshiftTimeout = (value: number[]) => {
    setLocalKBData(data => ({ ...data, autoshiftTimeout: value[0] }));
    setKbData({ ...localKBData, autoshiftTimeout: value[0] });
  };

  const setCombosWindow = (value: number[]) => {
    setLocalKBData(data => ({ ...data, combosWindow: value[0] }));
    setKbData({ ...localKBData, combosWindow: value[0] });
  };

  const setCombosIdleTime = (value: number[]) => {
    setLocalKBData(data => ({ ...data, combosIdleTime: value[0] }));
    setKbData({ ...localKBData, combosIdleTime: value[0] });
  };

  const setCapswordTimeout = (value: number[]) => {
    setLocalKBData(data => ({ ...data, capswordTimeout: value[0] }));
    setKbData({ ...localKBData, capswordTimeout: value[0] });
  };

  // const setSuperOverlapThreshold = (value: number[]) => {
  //   setLocalKBData(data => ({
  //     ...data,
  //     SuperOverlapThreshold: value[0],
  //   }));
  //   setKbData({
  //     ...localKBData,
  //     SuperOverlapThreshold: value[0],
  //   });
  // };

  const setSpeed = (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      mouseSpeed: value[0],
      mouseSpeedDelay: 10,
    }));
    setKbData({ ...localKBData, mouseSpeed: value[0], mouseSpeedDelay: 10 });
  };

  const setAccelSpeed = async (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      mouseAccelSpeed: value[0],
      mouseAccelDelay: 600,
    }));
    setKbData({ ...localKBData, mouseAccelSpeed: value[0], mouseAccelDelay: 600 });
  };

  const setWheelSpeed = async (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      mouseWheelSpeed: value[0],
      mouseWheelDelay: 100,
    }));
    setKbData({ ...localKBData, mouseWheelSpeed: value[0], mouseWheelDelay: 100 });
  };

  const setSpeedLimit = async (value: number[]) => {
    setLocalKBData(data => ({
      ...data,
      mouseSpeedLimit: value[0],
    }));
    setKbData({ ...localKBData, mouseSpeedLimit: value[0] });
  };

  const {
    qukeysHoldTimeout,
    qukeysOverlapThreshold,
    qukeysMinHold,
    qukeysMinPrior,
    qukeysQuickTapTerm,
    dualFunction,
    SuperTimeout,
    SuperHoldstart,
    // SuperOverlapThreshold,
    autoshiftTimeout,
    capswordTimeout,
    combosWindow,
    combosIdleTime,
    mouseSpeed,
    mouseAccelSpeed,
    mouseWheelSpeed,
    mouseSpeedLimit,
  } = localKBData;

  const mSpeed = (
    <div className="w-full flex gap-2">
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Slow</span>
      </div>
      <div className="w-full flex items-center p-0">
        <Slider min={0} max={127} value={[mouseSpeed]} onValueChange={setSpeed} />
      </div>
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Fast</span>
      </div>
    </div>
  );

  const mAccelS = (
    <div className="w-full flex gap-2">
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Slow</span>
      </div>
      <div className="w-full flex items-center p-0">
        <Slider min={0} max={254} value={[mouseAccelSpeed]} onValueChange={setAccelSpeed} />
      </div>
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Fast</span>
      </div>
    </div>
  );

  const mWheelS = (
    <div className="w-full flex gap-2">
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Slow</span>
      </div>
      <div className="w-full flex items-center p-0">
        <Slider min={1} max={15} value={[mouseWheelSpeed]} onValueChange={setWheelSpeed} />
      </div>
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Fast</span>
      </div>
    </div>
  );

  const mSpeedL = (
    <div className="w-full flex gap-2">
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Slow</span>
      </div>
      <div className="w-full flex items-center p-0">
        <Slider min={0} max={255} value={[mouseSpeedLimit]} onValueChange={setSpeedLimit} />
      </div>
      <div className="flex max-w-12 p-0 text-center items-center">
        <span className="tagsfix">Fast</span>
      </div>
    </div>
  );

  if (connected) {
    return (
      <Styles>
        <Card className="max-w-2xl mx-auto" variant="default">
          <CardHeader>
            <CardTitle>
              <IconTypo /> {sk20 ? "Superkeys" : i18n.keyboardSettings.superkeys.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {qukeysHoldTimeout >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? i18n.keyboardSettings.superkeys.holdstart.replace("Superkeys - ", "")
                          : labelWithFastSuper(i18n.keyboardSettings.qukeys.holdTimeout)}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.qukeys.holdTimeoutTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.qukeys.holdTimeoutTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.qukeys.holdTimeoutTip3}</li>
                                <li className="text-left">{i18n.keyboardSettings.qukeys.holdTimeoutTip4}</li>
                                <li className="text-left">{i18n.keyboardSettings.qukeys.holdTimeoutTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{qukeysHoldTimeout} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={1} max={255} value={[qukeysHoldTimeout]} onValueChange={setHoldTimeout} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
              {qukeysOverlapThreshold >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? labelWithFastSuper(i18n.keyboardSettings.qukeys.overlapThreshold).replace("Superkeys - ", "").trim()
                          : labelWithFastSuper(i18n.keyboardSettings.qukeys.overlapThreshold)}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.qukeys.overlapThresholdTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.qukeys.overlapThresholdTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.qukeys.overlapThresholdTip3}</li>
                                {sk20 && <li className="text-left">{i18n.keyboardSettings.qukeys.superkeysAffectsNote}</li>}
                                <li className="text-left">{i18n.keyboardSettings.qukeys.overlapThresholdTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{qukeysOverlapThreshold}%</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={0} max={100} value={[qukeysOverlapThreshold]} onValueChange={setOverlapThreshold} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
              {qukeysMinHold >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? labelWithFastSuper(i18n.keyboardSettings.qukeys.minHold).replace("Superkeys - ", "").trim()
                          : labelWithFastSuper(i18n.keyboardSettings.qukeys.minHold)}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.qukeys.minHoldTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.qukeys.minHoldTip2}</li>
                                {sk20 && <li className="text-left">{i18n.keyboardSettings.qukeys.superkeysAffectsNote}</li>}
                                <li className="text-left">{i18n.keyboardSettings.qukeys.minHoldTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{qukeysMinHold} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={1} max={254} value={[qukeysMinHold]} onValueChange={setMinHold} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
              {qukeysMinPrior >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? labelWithFastSuper(i18n.keyboardSettings.qukeys.minPrior).replace("Superkeys - ", "").trim()
                          : labelWithFastSuper(i18n.keyboardSettings.qukeys.minPrior)}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.qukeys.minPriorTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.qukeys.minPriorTip2}</li>
                                {sk20 && <li className="text-left">{i18n.keyboardSettings.qukeys.superkeysAffectsNote}</li>}
                                <li className="text-left">{i18n.keyboardSettings.qukeys.minPriorTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{qukeysMinPrior} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={1} max={254} value={[qukeysMinPrior]} onValueChange={setMinPrior} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
              {quickTap && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? labelWithFastSuper(i18n.keyboardSettings.qukeys.quickTapTerm).replace("Superkeys - ", "").trim()
                          : labelWithFastSuper(i18n.keyboardSettings.qukeys.quickTapTerm)}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.qukeys.quickTapTermTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.qukeys.quickTapTermTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.qukeys.quickTapTermTip3}</li>
                                {sk20 && <li className="text-left">{i18n.keyboardSettings.qukeys.superkeysAffectsNote}</li>}
                                <li className="text-left">{i18n.keyboardSettings.qukeys.quickTapTermTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      {/* Show the failed read instead of a slider, so a save never turns quick tap off by mistake */}
                      {qukeysQuickTapTerm < 0 ? (
                        <span className="tagsfix">{i18n.keyboardSettings.qukeys.quickTapTermReadError}</span>
                      ) : (
                        <span className="tagsfix whitespace-nowrap">
                          {qukeysQuickTapTerm === 0 ? i18n.keyboardSettings.qukeys.quickTapTermOff : `${qukeysQuickTapTerm} ms`}
                        </span>
                      )}
                    </div>
                  </div>
                  {qukeysQuickTapTerm >= 0 && (
                    <div className="w-full flex gap-2">
                      <div className="flex max-w-12 p-0 text-center items-center">
                        <span className="tagsfix">{i18n.keyboardSettings.qukeys.quickTapTermOff}</span>
                      </div>
                      <div className="w-full flex items-center p-0">
                        <Slider
                          min={0}
                          max={255}
                          step={5}
                          value={[Math.min(qukeysQuickTapTerm, 255)]}
                          onValueChange={setQuickTapTerm}
                        />
                      </div>
                      <div className="flex max-w-12 p-0 text-center items-center">
                        <span className="tagsfix">Longer</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {dualFunctionCapable && dualFunction === null && (
                <div className="w-full flex gap-2">
                  <div className="w-full">
                    <Heading headingLevel={3} renderAs="paragraph-sm">
                      {qukeysLabel(i18n.keyboardSettings.qukeys.decisionMode)}
                    </Heading>
                  </div>
                  {/* Show the failed read instead of the options, so a save never turns them off by mistake */}
                  <div className="flex items-center text-right">
                    <span className="tagsfix">{i18n.keyboardSettings.qukeys.dualFunctionReadError}</span>
                  </div>
                </div>
              )}
              {dualFunctionCapable && dualFunction !== null && (
                <>
                  <div className="w-full flex gap-2 items-center">
                    <div className="w-full">
                      <OptionHeading
                        label={qukeysLabel(i18n.keyboardSettings.qukeys.decisionMode)}
                        tip={i18n.keyboardSettings.qukeys.decisionModeTip1}
                        points={[
                          i18n.keyboardSettings.qukeys.decisionModeTip2,
                          i18n.keyboardSettings.qukeys.decisionModeTip3,
                          i18n.keyboardSettings.qukeys.decisionModeTip4,
                          i18n.keyboardSettings.qukeys.decisionModeTipDefault,
                        ]}
                      />
                    </div>
                    <div className="min-w-56">
                      <Select value={String(dualFunction.mode)} onValueChange={value => setDualFunction({ mode: Number(value) })}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={String(MODE_PERMISSIVE)}>{i18n.keyboardSettings.qukeys.modePermissive}</SelectItem>
                          <SelectItem value={String(MODE_HOLD_ON_OTHER_KEY)}>
                            {i18n.keyboardSettings.qukeys.modeHoldOnOtherKey}
                          </SelectItem>
                          <SelectItem value={String(MODE_TIMEOUT_ONLY)}>
                            {i18n.keyboardSettings.qukeys.modeTimeoutOnly}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="w-full flex gap-2 items-center justify-between">
                    <OptionHeading
                      label={qukeysLabel(i18n.keyboardSettings.qukeys.chordalHold)}
                      tip={i18n.keyboardSettings.qukeys.chordalHoldTip1}
                      points={[
                        i18n.keyboardSettings.qukeys.chordalHoldTip2,
                        i18n.keyboardSettings.qukeys.chordalHoldTip3,
                        i18n.keyboardSettings.qukeys.chordalHoldTipDefault,
                      ]}
                    />
                    <Switch
                      id="ChordalHoldSwitch"
                      checked={dualFunction.chordal}
                      onCheckedChange={(checked: boolean) => setDualFunction({ chordal: checked })}
                      variant="default"
                      size="sm"
                    />
                  </div>
                  <div className="w-full flex gap-2 items-center justify-between">
                    <OptionHeading
                      label={qukeysLabel(i18n.keyboardSettings.qukeys.speculativeHold)}
                      tip={i18n.keyboardSettings.qukeys.speculativeHoldTip1}
                      points={[
                        i18n.keyboardSettings.qukeys.speculativeHoldTip2,
                        i18n.keyboardSettings.qukeys.speculativeHoldTip3,
                        i18n.keyboardSettings.qukeys.speculativeHoldTipDefault,
                      ]}
                    />
                    <Switch
                      id="SpeculativeHoldSwitch"
                      checked={dualFunction.speculative}
                      onCheckedChange={(checked: boolean) => setDualFunction({ speculative: checked })}
                      variant="default"
                      size="sm"
                    />
                  </div>
                  {dualFunction.speculative && (
                    <div className="w-full flex flex-col gap-4 pl-4">
                      <div className="w-full flex gap-2 items-center justify-between">
                        <OptionHeading
                          label={i18n.keyboardSettings.qukeys.speculativeOneKey}
                          tip={i18n.keyboardSettings.qukeys.speculativeOneKeyTip}
                          points={[]}
                        />
                        <Switch
                          id="SpeculativeOneKeySwitch"
                          checked={dualFunction.speculativeOneKey}
                          onCheckedChange={(checked: boolean) => setDualFunction({ speculativeOneKey: checked })}
                          variant="default"
                          size="sm"
                        />
                      </div>
                      <div className="w-full">
                        <div className="w-full flex gap-2">
                          <div className="w-full">
                            <OptionHeading
                              label={i18n.keyboardSettings.qukeys.speculativeFlowTerm}
                              tip={i18n.keyboardSettings.qukeys.speculativeFlowTermTip}
                              points={[]}
                            />
                          </div>
                          <div className="flex items-center text-right">
                            <span className="tagsfix whitespace-nowrap">
                              {dualFunction.speculativeFlowTerm === 0
                                ? i18n.keyboardSettings.qukeys.dualFunctionOff
                                : `${dualFunction.speculativeFlowTerm} ms`}
                            </span>
                          </div>
                        </div>
                        <div className="w-full flex gap-2">
                          <div className="flex max-w-12 p-0 text-center items-center">
                            <span className="tagsfix">{i18n.keyboardSettings.qukeys.dualFunctionOff}</span>
                          </div>
                          <div className="w-full flex items-center p-0">
                            <Slider
                              min={0}
                              max={FLOW_TERM_MAX}
                              step={5}
                              value={[dualFunction.speculativeFlowTerm]}
                              onValueChange={(value: number[]) => setDualFunction({ speculativeFlowTerm: value[0] })}
                            />
                          </div>
                          <div className="flex max-w-12 p-0 text-center items-center">
                            <span className="tagsfix">Longer</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="w-full flex gap-2 items-center justify-between">
                    <OptionHeading
                      label={qukeysLabel(i18n.keyboardSettings.qukeys.retroTapping)}
                      tip={i18n.keyboardSettings.qukeys.retroTappingTip1}
                      points={[
                        i18n.keyboardSettings.qukeys.retroTappingTip2,
                        i18n.keyboardSettings.qukeys.retroTappingTipDefault,
                      ]}
                    />
                    <Switch
                      id="RetroTappingSwitch"
                      checked={dualFunction.retro}
                      onCheckedChange={(checked: boolean) => setDualFunction({ retro: checked })}
                      variant="default"
                      size="sm"
                    />
                  </div>
                  {(dualFunction.speculative || dualFunction.retro) && (
                    <div className="w-full flex gap-2 items-center">
                      <div className="w-full">
                        <OptionHeading
                          label={qukeysLabel(i18n.keyboardSettings.qukeys.neutralizer)}
                          tip={i18n.keyboardSettings.qukeys.neutralizerTip1}
                          points={[
                            i18n.keyboardSettings.qukeys.neutralizerTip2,
                            i18n.keyboardSettings.qukeys.neutralizerTipDefault,
                          ]}
                        />
                      </div>
                      <div className="min-w-56">
                        <Select
                          value={String(dualFunction.neutralizer)}
                          onValueChange={value => setDualFunction({ neutralizer: Number(value) })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {neutralizerOptions(dualFunction.neutralizer).map(option => (
                              <SelectItem value={String(option.value)} key={`neutralizer-${option.value}`}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <span className="text-sm text-gray-400 dark:text-gray-200">{i18n.keyboardSettings.qukeys.perKeyNote}</span>
                </>
              )}
              {SuperHoldstart >= 0 && !sk20 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.superkeys.holdstart}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.superkeys.chordingTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.superkeys.chordingTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.chordingTip3}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.chordingTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{SuperHoldstart} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={120} max={500} value={[SuperHoldstart]} onValueChange={setSuperHoldstart} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
              {/* {SuperOverlapThreshold >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.superkeys.overlap}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.superkeys.overlapTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.superkeys.overlapTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.overlapTip3}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.overlapTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Less</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={0} max={80} value={[SuperOverlapThreshold]} onValueChange={setSuperOverlapThreshold} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">More</span>
                    </div>
                  </div>
                </div>
              )} */}
              {SuperTimeout >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {sk20
                          ? i18n.keyboardSettings.superkeys.timeout.replace("Superkeys - ", "")
                          : i18n.keyboardSettings.superkeys.timeout}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <Heading headingLevel={4} renderAs="h4" className="text-gray-600 dark:text-gray-25 mb-3 leading-6">
                                {i18n.keyboardSettings.superkeys.timeoutTip1}
                              </Heading>
                              <ul className="list-disc pl-4">
                                <li className="text-left">{i18n.keyboardSettings.superkeys.timeoutTip2}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.timeoutTip3}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.timeoutTip4}</li>
                                <li className="text-left">{i18n.keyboardSettings.superkeys.timeoutTipDefault}</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{SuperTimeout} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={1} max={500} value={[SuperTimeout]} onValueChange={setSuperTimeout} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {autoshift && (
          <Card className="mt-3 max-w-2xl mx-auto" variant="default">
            <CardHeader>
              <CardTitle>
                <IconThunder /> {i18n.keyboardSettings.autoshift.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* No on/off switch: Autoshift is always enabled. A key only behaves
               * differently once it is actually assigned as autoshiftable in the
               * Layout Editor, so a global toggle added a second place to look
               * when a key "did nothing". */}
              <div className="flex flex-col gap-4">
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.autoshift.holdTimeout}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{i18n.keyboardSettings.autoshift.holdTimeoutTip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{autoshiftTimeout} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={50} max={2000} step={5} value={[autoshiftTimeout]} onValueChange={setAutoshiftTimeout} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Safer</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {combos && (
          <Card className="mt-3 max-w-2xl mx-auto" variant="default">
            <CardHeader>
              <CardTitle>
                <IconKeyboard /> {i18n.keyboardSettings.combos.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.combos.window}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{i18n.keyboardSettings.combos.windowTip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{combosWindow} ms</span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Stricter</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      {/* Bounds mirror CombosDygma::MIN/MAX_MATCH_WINDOW_MS; the
                       * firmware clamps anything outside them anyway. */}
                      <Slider
                        min={MIN_COMBO_WINDOW}
                        max={MAX_COMBO_WINDOW}
                        step={5}
                        value={[combosWindow]}
                        onValueChange={setCombosWindow}
                      />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Looser</span>
                    </div>
                  </div>
                </div>
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.combos.idleTime}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{i18n.keyboardSettings.combos.idleTimeTip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">
                        {combosIdleTime === 0 ? i18n.keyboardSettings.combos.idleTimeDisabled : `${combosIdleTime} ms`}
                      </span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Off</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      {/* Bounds mirror CombosDygma::MAX_IDLE_TIME_MS; 0 turns the
                       * requirement off. */}
                      <Slider
                        min={0}
                        max={MAX_COMBO_IDLE_TIME}
                        step={10}
                        value={[combosIdleTime]}
                        onValueChange={setCombosIdleTime}
                      />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Faster</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {capsword && (
          <Card className="mt-3 max-w-2xl mx-auto" variant="default">
            <CardHeader>
              <CardTitle>
                <IconLayerShift /> {i18n.keyboardSettings.capsword.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Always enabled; the CapsWord key has to be assigned to do
               * anything, which is toggle enough. */}
              <div className="flex flex-col gap-4">
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">
                      <Heading headingLevel={3} renderAs="paragraph-sm" className="flex items-center gap-2">
                        {i18n.keyboardSettings.capsword.idleTimeout}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="[&_svg]:text-purple-100 [&_svg]:dark:text-purple-200">
                              <IconInformation />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{i18n.keyboardSettings.capsword.idleTimeoutTip}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Heading>
                    </div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">
                        {capswordTimeout === 0 ? i18n.keyboardSettings.capsword.idleDisabled : `${capswordTimeout / 1000} s`}
                      </span>
                    </div>
                  </div>
                  <div className="w-full flex gap-2">
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Never</span>
                    </div>
                    <div className="w-full flex items-center p-0">
                      <Slider min={0} max={30000} step={500} value={[capswordTimeout]} onValueChange={setCapswordTimeout} />
                    </div>
                    <div className="flex max-w-12 p-0 text-center items-center">
                      <span className="tagsfix">Longer</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="mt-3 max-w-2xl mx-auto" variant="default">
          <CardHeader>
            <CardTitle>
              <IconMouse /> {i18n.keyboardSettings.mouse.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-0">
            <div className="flex flex-col gap-4">
              {mouseSpeed >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">{i18n.keyboardSettings.mouse.speed}</div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{mouseSpeed}</span>
                    </div>
                  </div>
                  {mSpeed}
                </div>
              )}
              {mouseAccelSpeed >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">{i18n.keyboardSettings.mouse.accelSpeed}</div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{mouseAccelSpeed}</span>
                    </div>
                  </div>
                  {mAccelS}
                </div>
              )}
              {mouseSpeedLimit >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">{i18n.keyboardSettings.mouse.speedLimit}</div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{mouseSpeedLimit}</span>
                    </div>
                  </div>
                  {mSpeedL}
                </div>
              )}
              {mouseWheelSpeed >= 0 && (
                <div className="w-full">
                  <div className="w-full flex gap-2">
                    <div className="w-full">{i18n.keyboardSettings.mouse.wheelSpeed}</div>
                    <div className="flex items-center text-right">
                      <span className="tagsfix whitespace-nowrap">{mouseWheelSpeed}</span>
                    </div>
                  </div>
                  {mWheelS}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Styles>
    );
  }
}

export { KeyboardSettings };
