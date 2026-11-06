// -*- mode: js-jsx -*-
/* Bazecor -- Kaleidoscope Command Center
 * Copyright (C) 2019  Keyboardio, Inc.
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
import React, { LegacyRef, useEffect, useState } from "react";

import Styled from "styled-components";
import { Button } from "@Renderer/components/atoms/Button";
import { i18n } from "@Renderer/i18n";
import log from "electron-log/renderer";

import { IconDelete, IconStopWatch } from "@Renderer/components/atoms/icons";
import PreviewMacroModal from "@Renderer/components/molecules/CustomModal/ModalPreviewMacro";
import Heading from "@Renderer/components/atoms/Heading";
import { MacroActionsType, MacroOptions, MacrosType } from "@Renderer/types/macros";
import { KeymapDB } from "../../../api/keymap";
import { MACRO_STEP } from "../../../api/parsers/macros";

import TimelineEditorForm from "./TimelineEditorForm";
import MacroOptionsPanel from "./MacroOptionsPanel";
import { actionTypes } from "./utils";

const Styles = Styled.div`
.card {
  width: auto;
  height: 100%;
  margin: 2rem;
  padding: 0;
  overflow: auto;
  background-color: ${({ theme }) => theme.card.background};
  color: ${({ theme }) => theme.card.color};
}
.card::-webkit-scrollbar {
  display: none;
}
.macroHeaderMem{
  display: flex;
  justify-content: space-between;
}
.macroHeaderTitle {
  align-self: center;
}
.macroFreeMem {
  width: 40%;
  display: flex;
  align-items: center;
}
.memSlider {
  width: -webkit-fill-available;
  margin-left: 8px;
  margin-right: 8px;
}
.memSlider {
  .rangeslider__fill {
    background-color: lightgreen;
  }
  .rangeslider__handle {
    display: none;
  }
}
.outOfMem {
  .rangeslider__fill {
    background-color: red;
  }
  .rangeslider__handle {
    background-color: red;
  }
}
.cardcontent {
  padding: 0px;
  &:last-child {
    padding-bottom: 0px;
  }
}
.iconFloppy{
  margin-right: 6px;
  width: 27px;
}
.cardHeader {
  background-color: ${({ theme }) => theme.card.background};
  color: ${({ theme }) => theme.card.color};
}
.cardTitle {
  color: ${({ theme }) => theme.card.color};
}
`;

interface Props {
  macro: MacrosType;
  macros: MacrosType[];
  updateActions: (actions: MacroActionsType[]) => void;
  clearMacro: any;
  scrollPos: number;
  updateScroll: (scrollPos: number) => void;
  macroUpgrade: boolean;
  onOptionsChange: (options: MacroOptions) => void;
  onAddMarker: () => void;
  onResetOptions: () => void;
}

const MacroManager = (props: Props) => {
  const {
    macro,
    macros,
    updateActions,
    clearMacro,
    scrollPos,
    updateScroll,
    macroUpgrade,
    onOptionsChange,
    onAddMarker,
    onResetOptions,
  } = props;
  const [componentWidth, setComponentWidth] = useState(0);
  const [macroID, setMacroID] = useState("");

  const trackingWidth: LegacyRef<HTMLElement> = React.createRef();
  const portal: LegacyRef<HTMLDivElement> = React.createRef();

  const keymapDB = new KeymapDB();

  const updateWidth = () => {
    setComponentWidth(trackingWidth.current.clientWidth);
  };

  useEffect(() => {
    setMacroID(Math.random().toString(36).substring(0, 7));
    updateWidth();
    window.addEventListener("resize", updateWidth);

    return () => {
      window.removeEventListener("resize", updateWidth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parseKey = (keycode: number) => {
    let macroName;
    const aux = keymapDB.parse(keycode);
    try {
      macroName = macros[parseInt(aux.label as string, 10) - 1]?.name.substring(0, 5);
    } catch (error) {
      log.warn("Warning, macro name not found, replacing", error);
      macroName = "*NotFound*";
    }
    if (keycode >= 53852 && keycode <= 53852 + 128) {
      return `${aux.extraLabel}.${macroName}`;
    }
    // if (aux.label === "SPACE") return " ";
    if (React.isValidElement(aux.label)) {
      return aux.extraLabel !== undefined && aux.extraLabel !== "" ? (
        <>
          {aux.extraLabel}
          <br />
          {aux.label}
        </>
      ) : (
        <>{aux.label}</>
      );
    }
    if (aux.extraLabel !== undefined) return `${aux.extraLabel}.${aux.label}`;
    return aux.label;
  };

  const previewAction = (item: MacroActionsType) => {
    switch (item.type) {
      case MACRO_STEP.RANDOM_DELAY:
        return (
          <>
            <IconStopWatch size="xs" /> {(item.keyCode as number[]).join("-")}
          </>
        );
      case MACRO_STEP.WAIT:
        return (
          <>
            <IconStopWatch size="xs" /> {item.keyCode}
          </>
        );
      case MACRO_STEP.KEYDOWN:
      case MACRO_STEP.KEYUP:
      case MACRO_STEP.TAP:
      case MACRO_STEP.KEYCODEDOWN:
      case MACRO_STEP.KEYCODEUP:
      case MACRO_STEP.TAPCODE:
        return parseKey(item.keyCode as number);
      case MACRO_STEP.RELEASE:
        return "Release";
      case MACRO_STEP.UNICODE:
        return String.fromCodePoint(item.keyCode as number);
      default:
        return actionTypes[item.type]?.name ?? "";
    }
  };

  const isPreviewModifier = (item: MacroActionsType) =>
    item.type >= MACRO_STEP.KEYDOWN &&
    item.type <= MACRO_STEP.TAPCODE &&
    (item.keyCode as number) > 223 &&
    (item.keyCode as number) < 232;

  return (
    <Styles className="timelineWrapper grid mt-4 grid-cols-[minmax(auto,_240px)_1fr] rounded-t-lg pb-[5px] bg-white/80 dark:bg-[#2B2C43]">
      <div className="timelineHeaderWrapper">
        <div className="timelineHeader flex items-baseline px-8 py-6">
          <div className="timelineHeaderContent">
            <Heading headingLevel={3} renderAs="h4" className="mb-2">
              {i18n.editor.macros.timelineTitle}
            </Heading>
            <div id="portalPreviewMacroModal" ref={portal} />
            {portal.current !== null ? (
              <PreviewMacroModal hookref={portal}>
                {macro.actions.length > 0
                  ? macro.actions.map(item => (
                      <span
                        key={`literal-${macroID}-${item?.id}`}
                        className={`previewKey action-${item.type} keyCode-${item.keyCode} ${isPreviewModifier(item) ? "isModifier" : ""}`}
                      >
                        {previewAction(item)}
                      </span>
                    ))
                  : ""}
              </PreviewMacroModal>
            ) : (
              ""
            )}
            <Button
              variant="outline"
              size="sm"
              iconDirection="right"
              onClick={clearMacro}
              className="px-[12px] py-[2px] w-full justify-between mt-1"
            >
              <IconDelete /> {i18n.editor.macros.clearMacro}
            </Button>
            <MacroOptionsPanel
              macro={macro}
              macroUpgrade={macroUpgrade}
              onOptionsChange={onOptionsChange}
              onAddMarker={onAddMarker}
              onResetOptions={onResetOptions}
            />
          </div>
        </div>
      </div>
      <div className="timelineBodyWrapper" ref={trackingWidth}>
        {macro !== null && macro.actions !== null && macro.actions.length > 0 ? (
          <TimelineEditorForm
            macro={macro}
            macros={macros}
            updateActions={updateActions}
            componentWidth={componentWidth}
            updateScroll={updateScroll}
            scrollPos={scrollPos}
          />
        ) : (
          <div className="loading marginCenter trackingWrapper flex flex-col justify-center h-full items-center">
            <div className="m-auto flex flex-wrap">
              <Heading headingLevel={4} renderAs="h4" className="w-full text-center">
                Your macro is currently empty.
              </Heading>
              <Heading headingLevel={5} renderAs="paragraph-sm" className="w-full text-center text-gray-400 dark:text-gray-300">
                Let&apos;s get started adding new action to your macro!
              </Heading>
            </div>
          </div>
        )}
        <div id="portalMacro" />
      </div>
    </Styles>
  );
};

export default MacroManager;
