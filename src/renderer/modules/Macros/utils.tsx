/* eslint-disable no-bitwise */
import { MacroActionsType, MacroEAType, MacroModType, MacrosType, RowsRepresentation } from "@Renderer/types/macros";
import React from "react";

import { MdUnfoldLess, MdKeyboardArrowUp, MdKeyboardArrowDown, MdTimer } from "react-icons/md";
import { KeymapDB } from "../../../api/keymap";

const keymapDB = new KeymapDB();

export const modifiers: MacroModType[] = [
  { id: 0, name: "LEFT SHIFT", keyCode: 225, color: "#e1f3f7" },
  { id: 1, name: "RIGHT SHIFT", keyCode: 229, color: "#e1f3f7" },
  { id: 2, name: "LEFT CTRL", keyCode: 224, color: "#f5e4e4" },
  { id: 3, name: "RIGHT CTRL", keyCode: 228, color: "#f5e4e4" },
  { id: 4, name: "LEFT ALT", keyCode: 226, color: "#faf8e1" },
  { id: 5, name: "RIGHT ALT", keyCode: 230, color: "#f2e7f5" },
  { id: 6, name: "LEFT OS", keyCode: 227, color: "#e6f0e4" },
  { id: 7, name: "RIGHT OS", keyCode: 231, color: "#e6f0e4" },
];
export const actionTypes: MacroEAType[] = [
  {
    enum: "MACRO_ACTION_END",
    name: "End macro",
    icon: "",
    smallIcon: "",
  },
  {
    enum: "MACRO_ACTION_STEP_INTERVAL",
    name: "Delay",
    icon: <MdTimer fontSize="large" />,
    smallIcon: <MdTimer />,
  },
  {
    enum: "MACRO_ACTION_STEP_WAIT",
    name: "Delay",
    icon: <MdTimer fontSize="large" />,
    smallIcon: <MdTimer />,
  },
  {
    enum: "MACRO_ACTION_STEP_KEYDOWN",
    name: "Function Key Press",
    icon: <MdKeyboardArrowDown fontSize="large" />,
    smallIcon: <MdKeyboardArrowDown />,
  },
  {
    enum: "MACRO_ACTION_STEP_KEYUP",
    name: "Function Key Release",
    icon: <MdKeyboardArrowUp fontSize="large" />,
    smallIcon: <MdKeyboardArrowUp />,
  },
  {
    enum: "MACRO_ACTION_STEP_TAP",
    name: "Fn. Press & Release",
    icon: <MdUnfoldLess fontSize="large" />,
    smallIcon: <MdUnfoldLess />,
  },
  {
    enum: "MACRO_ACTION_STEP_KEYCODEDOWN",
    name: "Key Press",
    icon: <MdKeyboardArrowDown fontSize="large" />,
    smallIcon: <MdKeyboardArrowDown />,
  },
  {
    enum: "MACRO_ACTION_STEP_KEYCODEUP",
    name: "Key Release",
    icon: <MdKeyboardArrowUp fontSize="large" />,
    smallIcon: <MdKeyboardArrowUp />,
  },
  {
    enum: "MACRO_ACTION_STEP_TAPCODE",
    name: "Key Press & Rel.",
    icon: <MdUnfoldLess fontSize="large" />,
    smallIcon: <MdUnfoldLess />,
  },
  {
    enum: "MACRO_ACTION_STEP_EXPLICIT_REPORT",
    name: "Explicit Report",
    icon: <></>,
    smallIcon: <></>,
  },
  {
    enum: "MACRO_ACTION_STEP_IMPLICIT_REPORT",
    name: "Implicit Report",
    icon: <></>,
    smallIcon: <></>,
  },
  { enum: "MACRO_ACTION_STEP_SEND_REPORT", id: 11, name: "Send Report" },
  {
    enum: "MACRO_ACTION_STEP_TAP_SEQUENCE",
    name: "Intervaled Special Keys",
    icon: <></>,
    smallIcon: <></>,
  },
  {
    enum: "MACRO_ACTION_STEP_TAP_CODE_SEQUENCE",
    name: "Intervaled Key Press & Release",
    icon: <></>,
    smallIcon: <></>,
  },
  { enum: "MACRO_ACTION_STEP_OPTIONS", name: "Options", icon: <></>, smallIcon: <></> },
  { enum: "MACRO_ACTION_STEP_RELEASE", name: "Pause until release", icon: <></>, smallIcon: <></> },
  { enum: "MACRO_ACTION_STEP_UNICODE", name: "Unicode", icon: <></>, smallIcon: <></> },
];

export const translator: { [key: number]: number } = {
  0x000e: 42,
  0x000f: 43,
  0x001c: 40,
  0x003a: 57,
  0x0e37: 70,
  0x0046: 71,
  0x0e45: 72,
  0x0001: 41,
  0x0039: 44,
  0x0e49: 75,
  0x0e51: 78,
  0x0e4f: 77,
  0x0e47: 74,
  0xe04b: 80,
  0xe048: 82,
  0xe04d: 79,
  0xe050: 81,
  0x0e52: 73,
  0x0e53: 76,
  0x0e5d: 101, // Menu key
  0x000b: 39,
  0x0002: 30,
  0x0003: 31,
  0x0004: 32,
  0x0005: 33,
  0x0006: 34,
  0x0007: 35,
  0x0008: 36,
  0x0009: 37,
  0x000a: 38,
  0x001e: 4,
  0x0030: 5,
  0x002e: 6,
  0x0020: 7,
  0x0012: 8,
  0x0021: 9,
  0x0022: 10,
  0x0023: 11,
  0x0017: 12,
  0x0024: 13,
  0x0025: 14,
  0x0026: 15,
  0x0032: 16,
  0x0031: 17,
  0x0018: 18,
  0x0019: 19,
  0x0010: 20,
  0x0013: 21,
  0x001f: 22,
  0x0014: 23,
  0x0016: 24,
  0x002f: 25,
  0x0011: 26,
  0x002d: 27,
  0x0015: 28,
  0x002c: 29,
  0x0052: 98,
  0x004f: 89,
  0x0050: 90,
  0x0051: 91,
  0x004b: 92,
  0x004c: 93,
  0x004d: 94,
  0x0047: 95,
  0x0048: 96,
  0x0049: 97,
  0x0037: 85,
  0x004e: 87,
  0x004a: 86,
  0x0053: 99,
  0x0e35: 84,
  0x0045: 83,
  0x003b: 58,
  0x003c: 59,
  0x003d: 60,
  0x003e: 61,
  0x003f: 62,
  0x0040: 63,
  0x0041: 64,
  0x0042: 65,
  0x0043: 66,
  0x0044: 67,
  0x0057: 68,
  0x0058: 69,
  0x005b: 104,
  0x005c: 105,
  0x005d: 106,
  0x0063: 107,
  0x0064: 108,
  0x0065: 109,
  0x0066: 110,
  0x0067: 111,
  0x0068: 112,
  0x0069: 113,
  0x006a: 114,
  0x006b: 115,
  0x0027: 51,
  0x000d: 46,
  0x0033: 54,
  0x000c: 45,
  0x0034: 55,
  0x0035: 56,
  0x0029: 53,
  0x001a: 47,
  0x002b: 49,
  0x001b: 48,
  0x0028: 52,
  0x001d: 224, // Left
  0x0e1d: 228,
  0x0038: 226, // Left
  0x0e38: 230,
  0x002a: 225, // Left
  0x0036: 229,
  0x0e5b: 227,
  0x0e5c: 231,
};

export const assignColor = (keyCode: number) => {
  let result: string;

  const color: MacroModType = modifiers.find(x => x.keyCode === keyCode);
  if (color === undefined) {
    result = "#ededed";
  } else {
    result = color.color;
  }
  return result;
};

export const createConversion = (actions: MacroActionsType[], macros: MacrosType[]) => {
  const converted: RowsRepresentation[] = actions.map((action, i) => {
    const randID = new Date().getTime() + Math.floor(Math.random() * 1000);
    let km;
    let txt;
    switch (action.type) {
      case 1:
        return {
          symbol: `${(action.keyCode as Array<number>)[0]} - ${(action.keyCode as Array<number>)[1]}`,
          keyCode: action.keyCode,
          type: action.type,
          id: i,
          uid: randID,
          color: "#faf0e3",
          ucolor: "transparent",
        };
      case 2:
        return {
          symbol: String(action.keyCode as number),
          keyCode: action.keyCode,
          type: action.type,
          id: i,
          uid: randID,
          color: "#faf0e3",
          ucolor: "transparent",
        };
      case 3:
      case 4:
      case 5:
        km = keymapDB.parse(action.keyCode as number);
        if (km.extraLabel === "MACRO") {
          const mName = macros[km.keyCode - 53852].name;
          txt = `M. ${mName}`;
        } else if (React.isValidElement(km.label) || React.isValidElement(km.extraLabel)) {
          txt = km.extraLabel ? (
            <>
              {km.extraLabel} {km.label}
            </>
          ) : (
            km.label
          );
        } else {
          txt = `${km.extraLabel} ${km.label}`;
        }
        return {
          symbol: txt,
          keyCode: action.keyCode,
          type: action.type,
          id: i,
          uid: randID,
          color: assignColor(action.keyCode as number),
          ucolor: "transparent",
        };
      case 6:
      case 7:
      case 8:
        km = keymapDB.parse(action.keyCode as number);
        if (React.isValidElement(km.label) || React.isValidElement(km.extraLabel)) {
          txt = km.extraLabel ? (
            <>
              {km.extraLabel} {km.label}
            </>
          ) : (
            km.label
          );
        } else {
          txt = km.extraLabel ? `${km.extraLabel} ${km.label}` : km.label;
        }
        return {
          symbol: txt,
          keyCode: action.keyCode,
          type: action.type,
          id: i,
          uid: randID,
          color: assignColor(action.keyCode as number),
          ucolor: "transparent",
        };
      default:
        // Show steps without an editor of their own by name and keep their payload, so a save writes them back unchanged
        return {
          symbol: actionTypes[action.type]?.name ?? `Step ${action.type}`,
          keyCode: action.keyCode,
          type: action.type,
          id: i,
          uid: randID,
          color: "#ededed",
          ucolor: "transparent",
        };
    }
  });
  return converted;
};

export const revertConversion = (actions: RowsRepresentation[]) => {
  const converted: MacroActionsType[] = actions.map(({ keyCode, type, id }) => ({
    keyCode,
    type,
    id,
  }));
  return converted;
};

export const addModToKey = (rows: any[], modID: number, modBit: number) => {
  const { name, keyCode, color } = modifiers[modID];
  const randID = new Date().getTime() + Math.floor(Math.random() * 1000);
  const randColor = `#${Math.floor(Math.abs(Math.sin(randID) * 16777215) % 16777215).toString(16)}`;
  const actions = rows;
  actions.splice(1, 0, {
    symbol: name,
    keyCode,
    type: 7,
    id: 2,
    color,
    uid: randID,
    ucolor: randColor,
  });
  actions.splice(0, 0, {
    symbol: name,
    keyCode,
    type: 6,
    id: 0,
    color,
    uid: randID,
    ucolor: randColor,
  });
  actions[1].keyCode ^= modBit;
  actions[1].symbol = keymapDB.parse(actions[1].keyCode).label;
  return actions;
};
