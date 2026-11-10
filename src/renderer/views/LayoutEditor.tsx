/* eslint-disable no-bitwise */
/* eslint-disable no-console */
// -*- mode: js-jsx -*-
/* Bazecor -- Kaleidoscope Command Center
 * Copyright (C) 2018, 2019  Keyboardio, Inc.
 * Copyright (C) 2020, 2024  Dygma Lab S.L.
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

import React, { MouseEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Styled from "styled-components";

import { keyboardCanvasStyles } from "@Renderer/modules/KeyboardCanvas/keyboardCanvasStyles";
import { comboBadgeStyles } from "@Renderer/modules/KeyboardCanvas/comboBadges";
import { altRepeatBadgeStyles } from "@Renderer/modules/KeyboardCanvas/altRepeatBadges";
import { ComboType } from "@Renderer/types/combos";
import { AltRepeatBlock, AltRepeatLayerEntry, AltRepeatRule, AltRepeatState } from "@Renderer/types/altRepeat";
import { HoldModsEntry, HoldModsState } from "@Renderer/types/holdMods";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { ipcRenderer } from "electron";
import fs from "fs";
import log from "electron-log/renderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@Renderer/components/atoms/Dialog";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import { CopyFromDialog } from "@Renderer/components/molecules/CustomModal/CopyFromDialog";
import { useDevice } from "@Renderer/DeviceContext";

// Types
import { LayerType, Neuron } from "@Renderer/types/neurons";
import { ColormapType, KeymapType, KeyType, LayoutEditorProps, PaletteType, SegmentedKeyType } from "@Renderer/types/layout";
import { SuperkeysType } from "@Renderer/types/superkeys";
import { MacrosType } from "@Renderer/types/macros";
import { DeviceClass } from "@Renderer/types/devices";

// Modules
import { PageHeader } from "@Renderer/modules/PageHeader";
import ColorEditor from "@Renderer/modules/ColorEditor";
import { KeyPickerKeyboard } from "@Renderer/modules/KeyPickerKeyboard";
import AltRepeatTabs from "@Renderer/modules/AltRepeat/AltRepeatTabs";
import PreviousKeyDialog from "@Renderer/modules/AltRepeat/PreviousKeyDialog";
import { holdPickerProps } from "@Renderer/modules/HoldMods/holdPickerProps";
import { loadHoldModsForEditor } from "@Renderer/modules/HoldMods/layoutLoad";
import { altRepeatMissed, createHoldModsSync, holdModsRetryWanted } from "@Renderer/modules/HoldMods/holdModsSync";
import {
  EMPTY_HOLD_SAVED,
  EMPTY_SUPERKEY_SAVED,
  HoldSavedState,
  LayoutSaveInput,
  LayoutSaveMode,
  LayoutSaveStep,
  SuperkeyMode,
  SuperkeySaveInput,
  SuperkeySavedState,
  runLayoutSave,
  usedHoldCodes,
  withHoldBaseline,
} from "@Renderer/modules/HoldMods/layoutSave";
import { MultiActionProps, MultiActionStorage } from "@Renderer/modules/MultiAction/MultiActionTab";
import { actionText, labelContext, superkeyFace, withGeneratedNames } from "@Renderer/modules/MultiAction/multiActionLabel";

// Components
import LayerSelector from "@Renderer/components/organisms/Select/LayerSelector";
import { Button } from "@Renderer/components/atoms/Button";
import { IconArrowDownWithLine, IconArrowUpWithLine, IconColorPalette } from "@Renderer/components/atoms/icons";
import LoaderLayout from "@Renderer/components/atoms/loader/loaderLayout";
import { i18n } from "@Renderer/i18n";

import Store from "@Renderer/utils/Store";
import getLanguage from "@Renderer/utils/language";
import { ClearLayerDialog } from "@Renderer/components/molecules/CustomModal/ClearLayerDialog";
import { ComboBreakDialog } from "@Renderer/components/molecules/CustomModal/ComboBreakDialog";
import { AltRepeatBreakDialog } from "@Renderer/components/molecules/CustomModal/AltRepeatBreakDialog";
import { DygmaDeviceInfoType } from "@Renderer/types/dygmaDefs";
import showRestoreWarnings from "@Renderer/utils/restoreWarnings";
import BlankTable from "../../api/keymap/db/blanks";
import Keymap, { KeymapDB } from "../../api/keymap";
import { rgb2w } from "../../api/color";
import Backup from "../../api/backup";
import { confirmBox } from "../utils/messageBox";
import {
  convertColormapRtoR2,
  convertKeymapRtoR2,
  parseColormapRaw,
  parseKeymapRaw,
  parseCombosRaw,
  parseMacrosRaw,
  parsePaletteRaw,
} from "../../api/parsers";
import {
  ComboBreakReason,
  comboBreakReason,
  combosAtPosition,
  isLegacyCombosReply,
  parseCombosStrict,
} from "../../api/parsers/combos";
import {
  MAX_ACTIVE_SUPERKEYS,
  SUPERKEY_FIRST,
  normalizeActions,
  parseSuperkeysTable,
  superkeyWriteFormat,
  writeSuperkeyTable,
} from "../../api/parsers/superkeys";
import {
  LayoutRefs,
  MultiActionResult,
  SkRef,
  SuperkeyDraft,
  applyMultiAction,
  conflictMessage,
  defaultCellName,
  dualUseOnlyCode,
  multiActionBreaks,
  prepareSuperkeyWrite,
  protectedSlots,
  reconcileDraft,
  refName,
  superkeyRefs,
  superkeySlot,
} from "../../api/parsers/multiAction";
import {
  MAX_ALT_REPEAT_RULES,
  altRepeatDefaultBlock,
  basePrevious,
  clearLayerRules,
  copyLayerRules,
  decodeDualUse,
  firmwareLayerCount,
  hasRepeat,
  isAllowedOutput,
  AltRepeatDevice,
  readAltRepeatRules,
  replaceAllRules,
  replaceLayerRules,
  replacesTap,
  rulesAt,
  serializeAltRepeat,
  withRepeat,
  writeAltRepeatRules,
} from "../../api/parsers/altRepeat";
import {
  HoldModsDevice,
  HoldRefSkip,
  encodeHold,
  fitHoldImport,
  heldMaskOf,
  layerHoldModsExport,
  writeHoldMods,
  writeUncached,
} from "../../api/parsers/holdMods";

const store = Store.getStore();

const Styles = Styled.div`
.keyboard-editor {
  // min-height: 100vh;
  height: inherit;
  display: flex;
  flex-flow: column;
  .title-row {
    // margin-bottom: 40px;
  }

  .keyconfig {
    position: absolute;
    bottom: 0;
  }
  .centerSpinner{
    z-index: 199;
    position: absolute;
    margin-left: 40vw;
    margin-top: 25vh;
    font-size: 3em;
  }
  .cancelButton{
    float: right;
  }
}
.buttons-row {
  position: fixed;
  bottom: 20px;
  flex-flow: nowrap;
  height: fit-content;
  padding: 0;
  margin: 0px 15px;
  width: fit-content;
  padding: 4px;
  background: ${({ theme }) => theme.styles.toggleButton.background};
  border-radius: 6px;
  button.btn {
    background: transparent;
  }
  button.btn + button.btn {
    margin-left: 4px;
  }
}
.layer-col {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  // height: 100%;
}

${keyboardCanvasStyles}

`;

type ModeType = "keyboard" | "color";

/* The draft before an edit, which "Undo" on a break warning puts back */
type EditSnapshot = {
  superkeys: SuperkeysType[] | undefined;
  custom: KeyType[][];
  rules: AltRepeatRule[];
};

/* Hold what "Undo" puts back when a new default turns off a key's previous-key tabs */
type AltRepeatBreakType = {
  reason: AltRepeatBlock;
  ruleCount: number;
  undo: EditSnapshot;
};

type CombosState = "ready" | "unsupported" | "failed";

const IDLE_ACTION = 1;
const TRANSPARENT_KEY = 65535;

/* The Superkey slots that the given layers, rules and combos reference */
const refSlotsOf = (refs: Partial<LayoutRefs>): number[] =>
  [
    ...superkeyRefs({
      customLayers: refs.customLayers ?? [],
      defaultLayers: refs.defaultLayers ?? [],
      layerOffset: refs.layerOffset ?? 0,
      rules: refs.rules ?? [],
      combos: refs.combos ?? [],
    }).keys(),
  ].sort((a, b) => a - b);

const LayoutEditor = (props: LayoutEditorProps) => {
  const defaultLayerNames = useMemo(
    () => [
      {
        id: 0,
        name: "L1",
      },
      {
        id: 1,
        name: "L2",
      },
      {
        id: 2,
        name: "L3",
      },
      {
        id: 3,
        name: "L4",
      },
      {
        id: 4,
        name: "L5",
      },
      {
        id: 5,
        name: "L6",
      },
      {
        id: 6,
        name: "L7",
      },
      {
        id: 7,
        name: "L8",
      },
      {
        id: 8,
        name: "L9",
      },
      {
        id: 9,
        name: "L10",
      },
    ],
    [],
  );

  const bkp = new Backup();

  const [mouseWheel, setMouseWheel] = useState(0);
  const [currentLayer, setCurrentLayer] = useState(0);
  const [previousLayer, setPreviousLayer] = useState(0);
  const [layerNames, setLayerNames] = useState([]);
  const [neuronID, setNeuronID] = useState("");
  const [currentKeyIndex, setCurrentKeyIndex] = useState(-1);
  const [currentLedIndex, setCurrentLedIndex] = useState(-1);
  const [keymap, setKeymap] = useState<KeymapType>({
    custom: [],
    default: [],
    onlyCustom: false,
  });
  const [palette, setPalette] = useState([]);
  const [colorMap, setColorMap] = useState([]);
  const [macros, setMacros] = useState<MacrosType[]>();
  const [superkeys, setSuperkeys] = useState<SuperkeysType[]>();
  const [combos, setCombos] = useState<ComboType[]>([]);
  /* Set while the break-combo warning is up; holds what "Undo" puts back. */
  const [comboBreak, setComboBreak] = useState<{
    reason: ComboBreakReason;
    comboIndexes: number[];
    undo: EditSnapshot;
  } | null>(null);
  /* "ready" once superkeys.map is read uncached and parsed */
  const [superkeysState, setSuperkeysState] = useState<SuperkeyMode>("unsupported");
  /* Rows at or above 70 from the load, kept to show what such a key held */
  const [superkeysBeyond, setSuperkeysBeyond] = useState<Map<number, number[]>>(new Map());
  /* The combos as the strict parser reads them. Allocation needs them, since their outputs use Superkey slots */
  const [combosState, setCombosState] = useState<CombosState>("unsupported");
  const [strictCombos, setStrictCombos] = useState<ComboType[]>([]);
  /* Remember what the keyboard holds of the Superkeys, so Save writes only changes and an edit never reuses a slot it may play */
  const skSaved = useRef<SuperkeySavedState>(EMPTY_SUPERKEY_SAVED);
  /* The layout as the keyboard holds it, to tell clashes already on the keyboard from new ones */
  const skBaseline = useRef<SuperkeyDraft | null>(null);
  const [altRepeatRules, setAltRepeatRules] = useState<AltRepeatRule[]>([]);
  const [altRepeatState, setAltRepeatState] = useState<AltRepeatState>("unsupported");
  /* Remember the table the keyboard holds so Save only writes a changed table. Null after a failed write */
  const savedAltRepeat = useRef<string | null>("0");
  /* Count rules loads and edits, so only the newest load applies, and only when no edit came after it started */
  const altRepeatLoads = useRef(0);
  const altRepeatEdits = useRef(0);
  /* Index the selected key's tabs, with -1 for Default */
  const [altRepeatTab, setAltRepeatTab] = useState(-1);
  /* Point ruleIndex at the rule whose previous key changes, or null for a new tab */
  const [previousDialog, setPreviousDialog] = useState<{ open: boolean; ruleIndex: number | null }>({
    open: false,
    ruleIndex: null,
  });
  const [altRepeatBreak, setAltRepeatBreak] = useState<AltRepeatBreakType | null>(null);
  /* Hold the rules warning until the combo warning closes */
  const [pendingAltRepeatBreak, setPendingAltRepeatBreak] = useState<AltRepeatBreakType | null>(null);
  /* The held modifiers of partial hold codes, as edited and not yet saved */
  const [holdModsTable, setHoldModsTable] = useState<HoldModsEntry[]>([]);
  const [holdModsState, setHoldModsState] = useState<HoldModsState>("loading");
  const [holdModsHelpAltRepeat, setHoldModsHelpAltRepeat] = useState(false);
  /* Remember what the keyboard may hold, so Save writes only changes and an edit never changes a code the keyboard may use */
  const holdSaved = useRef<HoldSavedState>(EMPTY_HOLD_SAVED);
  /* Apply only the newest load, only when no edit came after it started, and never while a save runs */
  const holdSync = useRef(createHoldModsSync()).current;

  const [modified, setModified] = useState(false);
  const [modeselect, setModeselect] = useState<ModeType>("keyboard");
  const [deviceName, setDeviceName] = useState("");
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [isMultiSelected, setIsMultiSelected] = useState(false);
  const [isColorButtonSelected, setIsColorButtonSelected] = useState(false);
  const [currentLanguageLayout, setCurrentLanguageLayout] = useState("english");
  const [showMacroModal, setShowMacroModal] = useState(false);
  const [showNeuronModal, setShowNeuronModal] = useState(false);
  const [leftSideModified, setLeftSideModified] = useState(false);
  const [isWireless, setIsWireless] = useState(false);

  const [selectedPaletteColor, setSelectedPaletteColor] = useState(-1);

  const scanned = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const { state } = useDevice();
  const [layerData, setLayerData] = useState<Array<KeyType>>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [ledIndexStart, setLedIndexStart] = useState(80);
  const [scanningStep, setScanningStep] = useState(0);
  const [keymapDB, setkeymapDB] = useState(new KeymapDB());
  const {
    darkMode,
    cancelContext,
    setLoading,
    onDisconnect,
    startContext,
    inContext,
    restoredOk,
    handleSetRestoredOk,
    saveButtonRef,
    discardChangesButtonRef,
    capabilitiesRefresh,
  } = props;

  const layoutEditorContainerRef = useRef(null);

  /* Label Superkeys from their actions, so key faces and names follow every edit */
  const labelCtx = useMemo(
    () =>
      labelContext(
        currentLanguageLayout,
        (layerNames ?? []).map((layer: LayerType) => layer?.name ?? ""),
        (macros ?? []).map(macro => macro.name ?? ""),
      ),
    [currentLanguageLayout, layerNames, macros],
  );

  const onLayerNameChange = (newName: string) => {
    const slicedLayerNames = layerNames.slice();
    slicedLayerNames[currentLayer] = {
      id: currentLayer,
      name: newName,
    };
    setLayerNames(slicedLayerNames);
    const neurons = store.get("neurons") as Neuron[];
    log.info(`changed layer ${currentLayer} name to: ${newName}`, slicedLayerNames, neuronID, neurons);
    neurons[neurons.findIndex(x => x.id === neuronID)].layers = slicedLayerNames;
    store.set("neurons", neurons);
  };

  const getColormap = useCallback(async (): Promise<ColormapType> => {
    const { currentDevice } = state;
    // Calculate total LEDs: keyboard LEDs + underglow LEDs
    const keyboardLEDs = currentDevice.device.keyboard.ledsLeft.length + currentDevice.device.keyboard.ledsRight.length;

    // For underglow, prefer using ledsLeft/ledsRight arrays if available and not empty, otherwise fall back to rows * columns
    let underglowLEDs = 0;
    if (
      currentDevice.device.keyboardUnderglow.ledsLeft?.length > 0 ||
      currentDevice.device.keyboardUnderglow.ledsRight?.length > 0
    ) {
      underglowLEDs =
        (currentDevice.device.keyboardUnderglow.ledsLeft?.length || 0) +
        (currentDevice.device.keyboardUnderglow.ledsRight?.length || 0);
    } else {
      underglowLEDs = currentDevice.device.keyboardUnderglow.rows * currentDevice.device.keyboardUnderglow.columns;
    }

    const layerSize = keyboardLEDs + underglowLEDs;
    const paletteData = (await currentDevice?.command("palette")) as string;
    const colorMapData = (await currentDevice?.command("colormap.map")) as string;

    const plette = parsePaletteRaw(paletteData, currentDevice?.device.RGBWMode);
    log.info("PARSED PALETTE: ", paletteData, plette, currentDevice?.device.RGBWMode);
    const colMap = parseColormapRaw(colorMapData, layerSize);
    log.info("PARSED COLORMAP: ", colorMapData, layerSize, "keyboardLEDs:", keyboardLEDs, "underglowLEDs:", underglowLEDs);

    return {
      palette: plette,
      colorMap: colMap,
    };
  }, [state]);

  const flatten = (arr: Array<unknown>) => [].concat(...arr);

  const updatePalette = async (device: DeviceClass, plette: PaletteType[]) => {
    let args: string[];
    if (state.currentDevice?.device.RGBWMode !== true) {
      args = flatten(plette.map(color => [color.r, color.g, color.b])).map(v => v.toString());
    } else {
      const paletteAux = plette.map(color => {
        const aux = rgb2w({ r: color.r, g: color.g, b: color.b });
        return aux;
      });
      args = flatten(paletteAux.map(color => [color.r, color.g, color.b, color.w])).map(v => v.toString());
      // log.info(plette, paletteAux, args);
    }

    const result = await device.command("palette", ...args);
    return result;
  };

  const updateColormap = async (device: DeviceClass, colormap: number[][]) => {
    const { currentDevice } = state;
    const args = flatten(colormap).map(v => v.toString());
    // check if colormap has the left side updated
    if (leftSideModified && currentDevice.type === "hid") {
      toast.warn(
        <ToastMessage
          title={i18n.success.btLeftSideColorsChanged}
          content={i18n.success.btLeftSideColorsChangedContent}
          icon={<IconColorPalette />}
        />,
        {
          autoClose: 10000,
          icon: "",
        },
      );
    }
    const result = await device.command("colormap.map", ...args);
    return result;
  };

  const AnalizeChipID = useCallback(
    async (CID: string) => {
      const { currentDevice } = state;
      let neurons = store.get("neurons") as Neuron[];
      let finalNeuron;
      log.info("Neuron ID", CID, neurons.length);
      if (neurons === undefined) {
        neurons = [];
      }
      if (neurons.some(n => n.id === CID)) {
        finalNeuron = neurons.find(n => n.id === CID);
      }
      const neuron: Neuron = {
        id: "",
        name: "",
        layers: new Array<LayerType>(),
        macros: new Array<MacrosType>(),
        superkeys: new Array<SuperkeysType>(),
      };
      setScanningStep(2);
      if (!neurons.some(n => n.id === CID) && neurons.length === 0) {
        neuron.id = CID;
        neuron.name = currentDevice?.device.info.product;
        neuron.layers = store.get("layerNames") !== undefined ? (store.get("layerNames") as Array<LayerType>) : defaultLayerNames;
        neuron.macros = store.get("macros") !== undefined ? (store.get("macros") as Array<MacrosType>) : [];
        neuron.superkeys = store.get("superkeys") !== undefined ? (store.get("superkeys") as Array<SuperkeysType>) : [];
        log.info("New neuron", neuron);
        neurons = neurons.concat(neuron);
        store.set("neurons", neurons);
        finalNeuron = neuron;
      }
      const existingDefy = neurons.some(n => n.id.length < 32);
      const existingRaise = neurons.some(n => n.id.length === 32);
      if (!neurons.some(n => n.id === CID) && neurons.length > 0) {
        neuron.id = CID;
        neuron.name = currentDevice?.device.info.product;
        neuron.layers = defaultLayerNames;
        neuron.macros = [];
        neuron.superkeys = [];
        const neuronCopy = JSON.parse(JSON.stringify(neuron));
        neuronCopy.id = CID;
        neuronCopy.name = neurons[0].name;
        neuronCopy.layers = neurons[0].layers;
        neuronCopy.macros = neurons[0].macros;
        neuronCopy.superkeys = neurons[0].superkeys;
        log.info("Additional neuron", neuron);
        let result;
        if (
          (currentDevice?.device.info.product === "Defy" && !existingDefy) ||
          (currentDevice?.device.info.product === "Raise" && !existingRaise)
        ) {
          result = false;
        } else {
          // Not window.confirm: it leaves the window without keyboard focus on
          // Windows, so the name fields of the editors stopped taking input.
          // Every new virtual keyboard comes through here (a new chip id).
          result = await confirmBox(
            "A new Neuron was detected and new settings need to be created. The names of the layers, macros and Superkeys are empty. Do you want to copy the names of your default Neuron (first in the list), or start with all names empty?",
            "Copy names",
            "Start empty",
          );
        }
        // var result = await userAction;
        // log.info(result, neuron, neuronCopy);
        if (result === false) {
          neurons = neurons.concat(neuron);
          store.set("neurons", neurons);
          finalNeuron = neuron;
        }
        if (result === true) {
          neurons = neurons.concat(neuronCopy);
          store.set("neurons", neurons);
          finalNeuron = neuronCopy;
        }
      }
      log.info("Final neuron", finalNeuron);
      if (finalNeuron) {
        const neuronData = {
          neurons,
          neuronID: neurons.findIndex(n => n.id === CID),
          layerNames: finalNeuron.layers,
          storedMacros: finalNeuron.macros,
          storedSuper: finalNeuron.superkeys,
          storedCombos: finalNeuron.combos ?? [],
        };
        log.info("connected to: ", neuronData.neuronID);
        setLayerNames(finalNeuron.layers);
        return neuronData;
      }
      setLayerNames(finalNeuron.layers);
      return finalNeuron;
    },
    [defaultLayerNames, state],
  );

  /* Mark a failed read so Save stays off until the rules load */
  const loadAltRepeatRules = useCallback(async (currentDevice: AltRepeatDevice) => {
    altRepeatLoads.current += 1;
    const load = altRepeatLoads.current;
    const edits = altRepeatEdits.current;

    /* The keyboard holds these rules, so their Superkey slots stay protected and count for clashes already on the keyboard */
    const keepSavedRules = (rules: AltRepeatRule[]) => {
      skSaved.current = { ...skSaved.current, ruleRefs: refSlotsOf({ rules }), uncertainRules: [] };

      if (skBaseline.current) {
        skBaseline.current = { ...skBaseline.current, rules };
      }
    };

    if (!store.get("capabilities.altRepeat")) {
      setAltRepeatState("unsupported");
      setAltRepeatRules([]);
      keepSavedRules([]);
      return;
    }

    const rules = await readAltRepeatRules(currentDevice);

    /* Drop a reply that a newer load or a rules edit made stale */
    if (load !== altRepeatLoads.current || edits !== altRepeatEdits.current) {
      return;
    }

    if (rules === null) {
      log.error("[LayoutEditor] altrepeat.map could not be read");
      setAltRepeatState("failed");
      setAltRepeatRules([]);
    } else {
      setAltRepeatState("ready");
      setAltRepeatRules(rules);
      savedAltRepeat.current = serializeAltRepeat(rules);
      keepSavedRules(rules);
    }
  }, []);

  /* Read the table and the keymap and rules it protects. A load that could not read them stays "loading" and keeps the protections */
  const loadHoldMods = useCallback(
    async (currentDevice: HoldModsDevice, product: string | undefined) => {
      const token = holdSync.beginLoad();

      /* A save runs, and loads once it ends */
      if (token === null) {
        return;
      }

      setHoldModsState("loading");

      const result = await loadHoldModsForEditor(currentDevice, product);

      /* Drop a reply that a newer load, a save or a table edit made stale. The next key pick retries */
      if (!holdSync.finishLoad(token)) {
        return;
      }

      setHoldModsState(result.state);
      setHoldModsHelpAltRepeat(result.helpListsAltRepeat);

      if (result.state === "ready") {
        setHoldModsTable(result.table);
        holdSaved.current = withHoldBaseline(result.table, result.baseline);
      } else if (result.state === "unsupported") {
        setHoldModsTable([]);
        holdSaved.current = EMPTY_HOLD_SAVED;
      }

      /* App's help read at connect failed, so load the rules the table waits for */
      if (altRepeatMissed(result.helpListsAltRepeat, store.get("capabilities.altRepeat"))) {
        store.set("capabilities.altRepeat", true);
        await loadAltRepeatRules(currentDevice);
      }
    },
    [holdSync, loadAltRepeatRules],
  );

  /* Allocate and import only once the rules are known too, since their outputs use codes of the table */
  const holdModsSettled = holdModsState === "ready" && (altRepeatState === "ready" || !holdModsHelpAltRepeat);

  const holdSaveMode = (): LayoutSaveMode => {
    if (holdModsState === "unsupported") {
      return "unsupported";
    }

    return holdModsSettled ? "settled" : "pending";
  };

  const scanKeyboard = useCallback(
    async (lang: string) => {
      log.info("Scanning KEYBOARD");
      const { currentDevice } = state;
      setLoading(true);
      try {
        // Acquire ChipID from device
        let chipID = await currentDevice?.command("hardware.chip_id");
        setScanningStep(1);
        chipID = chipID.replace(/\s/g, "");
        const neuronData = await AnalizeChipID(chipID);

        // Restore backup if process failed after flashing
        setScanningStep(3);
        if (!restoredOk) {
          log.info("Error when restoring data after flash detected, repairing...");
          try {
            const backupFolder = store.get("settings.backupFolder") as string;
            const neurons = store.get("neurons") as Neuron[];
            const latestBackup = await Backup.getLatestBackup(backupFolder, chipID, currentDevice);
            await Backup.restoreBackup(neurons, chipID, latestBackup, currentDevice);
            showRestoreWarnings();
            log.info("repaired successfully");
            handleSetRestoredOk(true);
          } catch (error) {
            log.info("error when trying to restore keyboard after a bad flash");
          }
        }

        const device = currentDevice?.device.info.product;
        const wirelessChecker = currentDevice?.device.info.keyboardType === "wireless" || currentDevice?.device.wireless;
        if (lang) {
          const deviceLang = { ...currentDevice?.device, language: true };
          currentDevice.commands = {};
          currentDevice.commands.keymap = new Keymap(deviceLang);
          setkeymapDB((currentDevice?.commands.keymap as Keymap).db);
        }

        // let defLayer = await currentDevice?.command("settings.defaultLayer");
        // defLayer = parseInt(defLayer, 10) || 0;

        setScanningStep(4);
        /* Read uncached, since the Superkey slots the keyboard holds are protected from reuse */
        const defaults = (await currentDevice?.noCacheCommand("keymap.default")) as string;
        setScanningStep(5);
        const custom = (await currentDevice?.noCacheCommand("keymap.custom")) as string;
        const onlycstm = (await currentDevice?.command("keymap.onlyCustom")) as string;
        const onlyCustom = Boolean(parseInt(onlycstm, 10));
        const KeyMap: KeymapType = {
          custom: undefined,
          default: undefined,
          onlyCustom: false,
        };

        const layerSize = currentDevice.device.keyboard.rows * currentDevice.device.keyboard.columns;
        KeyMap.custom = parseKeymapRaw(custom, layerSize).map(l => l.map((k: number) => keymapDB.parse(k)));
        KeyMap.default = parseKeymapRaw(defaults, layerSize).map(l => l.map((k: number) => keymapDB.parse(k)));
        KeyMap.onlyCustom = onlyCustom;

        let empty = true;
        for (const layer of KeyMap.custom) {
          for (const i of layer) {
            if (i.keyCode !== 65535) {
              empty = false;
              break;
            }
          }
        }

        log.info("KEYMAP", KeyMap.custom);
        if (empty && KeyMap.custom.length > 0) {
          log.info("Custom keymap is empty, copying defaults");
          for (let i = 0; i < KeyMap.default.length; i += 1) {
            KeyMap.custom[i] = KeyMap.default[i].slice();
          }
          KeyMap.onlyCustom = true;
          const args = flatten(KeyMap.custom).map(k => keymapDB.serialize(k).toString());
          await currentDevice?.command("keymap.custom", ...args);
        }

        // Loading Colors
        setScanningStep(6);
        const colormap = await getColormap();
        const plette = colormap.palette.slice();

        // loading Macros
        setScanningStep(7);
        const rawMacros = (await currentDevice?.command("macros.map")) as string;
        const parsedMacros = parseMacrosRaw(rawMacros, neuronData.storedMacros);

        // Loading Superkeys, uncached so the editor knows exactly what the keyboard holds
        setScanningStep(8);
        let nextSuperkeysState: SuperkeyMode = "unsupported";
        let rawSuper: string | null = null;
        let skParsed: ReturnType<typeof parseSuperkeysTable> = null;

        if (store.get("capabilities.superkeys")) {
          const reply = await currentDevice?.noCacheCommand("superkeys.map");
          skParsed = parseSuperkeysTable(reply);

          if (skParsed === null) {
            log.error("[LayoutEditor] superkeys.map could not be read", reply);
            nextSuperkeysState = "failed";
          } else {
            nextSuperkeysState = "ready";
            rawSuper = reply as string;
          }
        }

        const skTable = skParsed?.table ?? [];
        const parsedSuper = withGeneratedNames(skTable, labelContext(lang));

        // Loading Combos, to badge the keys that belong to one. Firmware that
        // predates the feature answers with nothing, and that is not an error
        // worth failing the whole layout load over. Neither is the 4-key
        // format of the first combos firmware: it is not badged at all rather
        // than misread.
        // Firmware older than the one that ships combos is not asked at all (see capabilities.combos).
        let nextCombosState: CombosState = "unsupported";
        let nextStrictCombos: ComboType[] = [];

        if (!store.get("capabilities.combos")) {
          setCombos([]);
        } else {
          try {
            const rawCombos = (await currentDevice?.noCacheCommand("combos.map")) as string;
            const usable = rawCombos && rawCombos.trim().length > 0 && !isLegacyCombosReply(rawCombos);
            setCombos(usable ? parseCombosRaw(rawCombos, neuronData.storedCombos) : []);
            /* Allocate Superkeys only with combos read in full, since their outputs use slots too */
            const strict = parseCombosStrict(rawCombos);
            nextCombosState = strict === null ? "failed" : "ready";
            nextStrictCombos = strict ?? [];
          } catch (error) {
            log.info("[LayoutEditor] combos.map unavailable; no combo badges will be shown");
            setCombos([]);
            nextCombosState = "failed";
          }
        }

        /* The keyboard's Superkey references. Loading the rules adds theirs */
        const scanRefs: LayoutRefs = {
          customLayers: KeyMap.custom.map(layer => layer.map((key: KeyType) => key.keyCode)),
          defaultLayers: KeyMap.onlyCustom ? [] : KeyMap.default.map(layer => layer.map((key: KeyType) => key.keyCode)),
          layerOffset: KeyMap.onlyCustom ? 0 : KeyMap.default.length,
          rules: [],
          combos: nextStrictCombos,
        };
        skSaved.current = {
          ...EMPTY_SUPERKEY_SAVED,
          table: rawSuper,
          storedRows: skParsed?.storedRows ?? null,
          keymapRefs: refSlotsOf({ ...scanRefs, combos: [] }),
          comboRefs: refSlotsOf({ combos: nextStrictCombos }),
        };
        skBaseline.current = nextSuperkeysState === "ready" ? { ...scanRefs, table: skTable } : null;
        setSuperkeysState(nextSuperkeysState);
        setSuperkeysBeyond(skParsed?.beyond ?? new Map());
        setCombosState(nextCombosState);
        setStrictCombos(nextStrictCombos);

        await loadAltRepeatRules(currentDevice);
        await loadHoldMods(currentDevice, device);
        setAltRepeatTab(-1);

        setScanningStep(9);
        let showMM = false;
        if (KeyMap.custom) {
          const oldmacro = [...Array(64).keys()].map(x => x + 24576);
          // log.info("testing", oldmacro);
          for (let index = 0; index < KeyMap.custom.length; index += 1) {
            // log.info(keymap.custom[index]);
            if (KeyMap.custom[index].some((r: { keyCode: number }) => oldmacro.includes(r.keyCode))) {
              showMM = true;
              break;
            }
          }
        }

        setScanningStep(10);
        setLedIndexStart(currentDevice?.device.info.product === "Raise" ? 80 : 80);
        setNeuronID(chipID);
        setKeymap(KeyMap);
        setShowDefaults(!KeyMap.onlyCustom);
        setPalette(plette);
        setColorMap(colormap.colorMap);
        setMacros(parsedMacros);
        setSuperkeys(parsedSuper);
        setNeuronID(chipID);
        setDeviceName(device);
        setIsWireless(wirelessChecker);
        setShowMacroModal(showMM);
        scanned.current = true;
        setLoading(false);
        setScanningStep(0);

        // Save in the background, since Layer Lens has nothing to draw until the keyboard has a backup
        Backup.SaveFirstBackup(chipID, currentDevice).catch(error => log.warn("[LayoutEditor] first backup failed", error));
      } catch (e) {
        log.error(e);
        toast.error(e);
        setLoading(false);
        setScanningStep(0);
        onDisconnect();
      }
    },
    [
      state,
      setLoading,
      AnalizeChipID,
      restoredOk,
      getColormap,
      handleSetRestoredOk,
      keymapDB,
      onDisconnect,
      loadAltRepeatRules,
      loadHoldMods,
    ],
  );

  const assignKey = (layer: number, keyIndex: number, keyCode: number) => {
    try {
      const kmap = keymap.custom.slice();
      const l = keymap.onlyCustom ? layer : layer - keymap.default.length;
      const parsedKey = keymapDB.parse(keyCode);
      log.info(
        `[KeyAssign] layer=${layer} storedLayer=${l} keyIndex=${keyIndex} keyCode=${keyCode} onlyCustom=${keymap.onlyCustom} parsed=`,
        parsedKey,
      );
      if (l < 0 || !kmap[l]) {
        log.error(
          `[KeyAssign] target layer ${l} does not exist in the custom keymap (onlyCustom=${keymap.onlyCustom}); the key will NOT be stored`,
        );
      }
      kmap[l][keyIndex] = parsedKey;
      setModified(true);
      setKeymap({
        default: keymap.default,
        onlyCustom: keymap.onlyCustom,
        custom: kmap,
      });
      startContext();
    } catch (error) {
      log.error("Error when assigning key to keymap", error);
    }
  };

  /* Copy the layers, since assignKey changes a layer array in place */
  const editSnapshot = (): EditSnapshot => ({
    superkeys,
    custom: keymap.custom.map(layer => layer.slice()),
    rules: altRepeatRules,
  });

  const restoreSnapshot = (snapshot: EditSnapshot) => {
    setSuperkeys(snapshot.superkeys);
    setKeymap({
      default: keymap.default,
      onlyCustom: keymap.onlyCustom,
      custom: snapshot.custom,
    });

    if (snapshot.rules !== altRepeatRules) {
      altRepeatEdits.current += 1;
      setAltRepeatRules(snapshot.rules);
    }

    setModified(true);
    startContext();
  };

  /* Show one warning at a time. The combo warning goes first */
  const showBreaks = (
    comboReason: ComboBreakReason | null,
    comboIndexes: number[],
    ruleReason: AltRepeatBlock | null,
    ruleCount: number,
    undo: EditSnapshot,
  ) => {
    const rulesBreak =
      altRepeatState === "ready" && ruleReason !== null && ruleCount > 0 ? { reason: ruleReason, ruleCount, undo } : null;

    if (comboReason && comboIndexes.length > 0) {
      setComboBreak({ reason: comboReason, comboIndexes, undo });
      setPendingAltRepeatBreak(rulesBreak);
    } else if (rulesBreak) {
      setAltRepeatBreak(rulesBreak);
    }
  };

  const onKeyChange = (keyCode: number) => {
    // Keys can only change on the custom layers
    const layer = currentLayer;
    const keyIndex = currentKeyIndex;

    if (keyIndex === -1) {
      return;
    }

    const l = keymap.onlyCustom ? layer : layer - keymap.default.length;
    const previousKeyCode = keymap.custom[l]?.[keyIndex]?.keyCode;
    const undo = editSnapshot();

    assignKey(layer, keyIndex, keyCode);

    /* Warn when the new key stops a saved combo from firing. Only on an actual
     * change, so re-picking the same key does not nag again. */
    if (previousKeyCode === undefined || previousKeyCode === keyCode) {
      return;
    }

    const reason = comboBreakReason(keyCode, superkeys);
    /* A key can be in several combos on this layer; every one of them breaks. */
    const comboIndexes = reason ? combosAtPosition(combos, keyIndex, layer) : [];
    const block = altRepeatDefaultBlock(keyCode, superkeys);
    const ruleCount = rulesAt(altRepeatRules, layer, keyIndex).length;

    showBreaks(reason, comboIndexes, block, ruleCount, undo);
  };

  const undoComboBreak = () => {
    if (comboBreak) {
      restoreSnapshot(comboBreak.undo);
    }

    setComboBreak(null);
    setPendingAltRepeatBreak(null);
  };

  const keepComboBreak = () => {
    setComboBreak(null);
    setAltRepeatBreak(pendingAltRepeatBreak);
    setPendingAltRepeatBreak(null);
  };

  const undoAltRepeatBreak = () => {
    if (altRepeatBreak) {
      restoreSnapshot(altRepeatBreak.undo);
    }

    setAltRepeatBreak(null);
  };

  const keysPerLayer = () => state.currentDevice.device.keyboard.rows * state.currentDevice.device.keyboard.columns;

  const rulesOnLayer = (layer: number) => altRepeatRules.filter(rule => rule.layer === layer).length;

  /* Replace the whole table after a load, copy, clear or import */
  const replaceRules = (next: AltRepeatRule[]) => {
    altRepeatEdits.current += 1;
    setAltRepeatRules(next);
    setAltRepeatTab(-1);
  };

  /* Change the table from an edit the user saves or discards */
  const editRules = (next: AltRepeatRule[]) => {
    altRepeatEdits.current += 1;
    setAltRepeatRules(next);
    setModified(true);
    startContext();
  };

  const showAltRepeatToast = (content: string) => {
    toast.warn(<ToastMessage title={i18n.editor.altRepeat.title} content={content} icon={<IconArrowDownWithLine />} />, {
      autoClose: 4000,
      icon: "",
    });
  };

  /* Change the held modifiers table from an edit the user saves or discards */
  const editHoldMods = (next: HoldModsEntry[]) => {
    if (next === holdModsTable) {
      return;
    }

    holdSync.edited();
    setHoldModsTable(next);
    setModified(true);
    startContext();
  };

  const showHoldModsToast = (content: string) => {
    toast.warn(<ToastMessage title={i18n.editor.holdMods.title} content={content} icon={<IconArrowDownWithLine />} />, {
      autoClose: 4000,
      icon: "",
    });
  };

  const draftCodes = (layers: KeyType[][]): number[][] => layers.map(layer => layer.map(key => key.keyCode));

  const layerOffset = keymap.onlyCustom ? 0 : keymap.default.length;

  /* Everything in the draft that can reference a Superkey */
  const draftRefs = (custom: number[][], rules: AltRepeatRule[]): LayoutRefs => ({
    customLayers: custom,
    defaultLayers: keymap.onlyCustom ? [] : draftCodes(keymap.default),
    layerOffset,
    rules,
    combos: combosState === "ready" ? strictCombos : [],
  });

  const draftTable = (): number[][] =>
    (superkeys ?? []).slice(0, MAX_ACTIVE_SUPERKEYS).map(superkey => normalizeActions(superkey.actions));

  const showMultiActionToast = (content: string) => {
    toast.warn(<ToastMessage title={i18n.editor.multiAction.title} content={content} icon={<IconArrowDownWithLine />} />, {
      autoClose: 4000,
      icon: "",
    });
  };

  /* Why Multi-action edits are off, or undefined. A new slot is safe only when every reference to the slots is known */
  const multiActionBlock = (): string | undefined => {
    if (superkeysState === "failed") {
      return i18n.editor.multiAction.unreadable;
    }

    if (superkeysState !== "ready") {
      return undefined;
    }

    if (combosState === "failed") {
      return i18n.editor.multiAction.combosUnknown;
    }

    return altRepeatState === "failed" ? i18n.editor.multiAction.rulesUnknown : undefined;
  };

  /* The slot this cell held on the keyboard, when only this cell used it there and its save is certain, so an edit can take it back */
  const ownBaselineSlot = (customIdx: number, position: number): number | undefined => {
    const baseline = skBaseline.current;
    const code = baseline?.customLayers[customIdx]?.[position];
    const slot = code === undefined ? null : superkeySlot(code);

    if (baseline === null || slot === null) {
      return undefined;
    }

    const refs = superkeyRefs(baseline).get(slot) ?? [];
    const [only] = refs;
    const onlyThisCell =
      refs.length === 1 && only.kind === "cell" && only.layer === customIdx + baseline.layerOffset && only.position === position;
    const { uncertainKeymap, uncertainRules, uncertainCombos } = skSaved.current;
    const uncertain = [...uncertainKeymap, ...uncertainRules, ...uncertainCombos].includes(slot);

    return onlyThisCell && !uncertain ? slot : undefined;
  };

  /* Set the five actions of the selected cell, as a plain key, a dual-function key or a Superkey */
  const onMultiActionChange = (actions: number[]) => {
    const customIdx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;
    const custom = draftCodes(keymap.custom);
    const currentCode = custom[customIdx]?.[currentKeyIndex];

    if (currentKeyIndex === -1 || currentCode === undefined || multiActionBlock() !== undefined) {
      return;
    }

    const table = draftTable();
    let result: MultiActionResult;

    if (superkeysState === "ready") {
      const target: SkRef = { kind: "cell", layer: currentLayer, position: currentKeyIndex, custom: true };
      result = applyMultiAction(
        {
          table,
          refs: superkeyRefs(draftRefs(custom, altRepeatRules)),
          protectedSlots: protectedSlots(skSaved.current),
          currentCode,
          ownBaselineSlot: ownBaselineSlot(customIdx, currentKeyIndex),
        },
        target,
        actions,
      );
    } else {
      const code = dualUseOnlyCode(actions);

      if (code === null) {
        showMultiActionToast(i18n.editor.multiAction.dualUseOnlyRefused);
        return;
      }

      result = { table, code };
    }

    if ("error" in result) {
      showMultiActionToast(result.error === "capacity" ? i18n.editor.multiAction.capacity : i18n.editor.multiAction.emptyRule);
      return;
    }

    const { table: nextTable, code: nextCode } = result;

    if (nextCode === currentCode && nextTable === table) {
      return;
    }

    const undo = editSnapshot();
    const after = custom.map((codes, l) =>
      l === customIdx ? codes.map((code, p) => (p === currentKeyIndex ? nextCode : code)) : codes,
    );
    const breaks = multiActionBreaks(
      { customLayers: custom, table, layerOffset },
      { customLayers: after, table: nextTable, layerOffset },
      combos,
      altRepeatRules,
    );

    if (nextTable !== table) {
      setSuperkeys(withGeneratedNames(nextTable, labelCtx));
      setModified(true);
      startContext();
    }

    if (nextCode !== currentCode) {
      assignKey(currentLayer, currentKeyIndex, nextCode);
    }

    showBreaks(breaks.comboReason, breaks.comboIndexes, breaks.ruleReason, breaks.ruleCount, undo);
  };

  /* The code for a shortcut with the modifiers in `held` held, or null when the table has no room. Never touch a code still in use */
  const allocateHold = (shortcut: number, held: number, skip: HoldRefSkip): number | null => {
    const used = usedHoldCodes(draftCodes(keymap.custom), altRepeatRules, holdSaved.current, skip);
    const encoded = encodeHold(shortcut, held, holdModsTable, used);

    if ("error" in encoded) {
      showHoldModsToast(encoded.error === "slots" ? i18n.editor.holdMods.slotsFull : i18n.editor.holdMods.capacityRefused);
      return null;
    }

    editHoldMods(encoded.table);
    return encoded.code;
  };

  /**
   * Verify that colors in keyboard button and in color palette is equal
   * @param {number} colorIdx Number of palette index
   * @param {number} cLayer Number of current layer
   * @param {number} cLedIndex Number of current selected keyboard button
   * @return {boolean}
   */

  const onVerificationColor = (colorIdx: number, cLayer: number, cLedIndex: number): boolean => {
    const currentIndexKeyButton = colorMap[cLayer][cLedIndex];
    return currentIndexKeyButton === colorIdx;
  };

  /**
   * Change state if click control or shift button
   * @param {number} layer Number of current layer
   * @param {number} ledIndex Number of current selected keyboard button
   */
  const onCtrlShiftPress = (layer: number, ledIndex: number) => {
    setSelectedPaletteColor(colorMap[layer][ledIndex]);
    setIsMultiSelected(true);
    setIsColorButtonSelected(true);
  };

  /**
   * Change state if color buton selected
   * @param {number} layer Number of layer in attribute of keyboard button
   * @param {number} cLayer Number of current layer from state
   * @param {number} ledIndex Number of current selected keyboard button
   */
  const onButtonKeyboardColorChange = (cLayer: number, layer: number, ledIndex: number) => {
    const isEqualColor = onVerificationColor(selectedPaletteColor, cLayer, ledIndex);
    if (!(!modified && isEqualColor)) {
      const colormap = colorMap.slice();
      colormap[cLayer][ledIndex] = selectedPaletteColor;
      setSelectedPaletteColor(colorMap[layer][ledIndex]);
      setColorMap(colormap);
      setModified(true);
    }
    startContext();
  };

  const onKeySelect = (event: MouseEvent) => {
    const { currentTarget }: { currentTarget: Element } = event;
    const layer = parseInt(currentTarget.getAttribute("data-layer"), 10);
    const keyIndex = parseInt(currentTarget.getAttribute("data-key-index"), 10);
    const ledIndex = parseInt(currentTarget.getAttribute("data-led-index"), 10);

    if (keyIndex === currentKeyIndex) {
      setCurrentKeyIndex(-1);
      return;
    }

    setCurrentLayer(layer);
    if (colorMap.length > 0 && layer >= 0 && layer < colorMap.length) {
      setCurrentKeyIndex(keyIndex);
      setCurrentLedIndex(ledIndex);
      setModeselect(ledIndex >= ledIndexStart ? "color" : modeselect);
    }
    setCurrentKeyIndex(keyIndex);
    if (event.ctrlKey || event.shiftKey) {
      onCtrlShiftPress(layer, ledIndex);
    } else {
      if (selectedPaletteColor !== null && isMultiSelected && isColorButtonSelected) {
        onButtonKeyboardColorChange(currentLayer, layer, ledIndex);
      }
      if (isColorButtonSelected && !isMultiSelected) {
        setIsMultiSelected(true);
        onButtonKeyboardColorChange(currentLayer, layer, ledIndex);
      }
    }
  };

  const selectLayer = (id: number) => {
    if (id === undefined) return;
    setPreviousLayer(currentLayer);
    setCurrentLayer(id);
  };

  const saveFailedMessage = (step: LayoutSaveStep): string => {
    const messages: Partial<Record<LayoutSaveStep, string>> = {
      rules: i18n.editor.altRepeat.saveFailed,
      superkeys: i18n.editor.multiAction.saveFailed,
      skgc: i18n.editor.multiAction.gcFailed,
      perKey: i18n.editor.multiAction.perKeyFailed,
    };

    return messages[step] ?? i18n.editor.holdMods.saveFailed;
  };

  const storeSuperkeyNames = (named: SuperkeysType[]) => {
    const neurons = store.get("neurons") as Neuron[];
    const index = Array.isArray(neurons) ? neurons.findIndex(neuron => neuron.id === neuronID) : -1;

    if (index < 0) {
      return;
    }

    neurons[index].superkeys = named;
    store.set("neurons", neurons);
  };

  const onApply = async () => {
    const { currentDevice } = state;

    if (altRepeatState === "failed" || holdModsState === "failed") {
      const content = altRepeatState === "failed" ? i18n.editor.altRepeat.loadFailed : i18n.editor.holdMods.loadFailed;
      toast.error(<ToastMessage title="Error when saving" content={content} icon={<IconArrowDownWithLine />} />, {
        autoClose: 4000,
        icon: "",
      });
      return;
    }

    const custom = draftCodes(keymap.custom);
    const refs = draftRefs(custom, altRepeatRules);
    let superkeysInput: SuperkeySaveInput | undefined;

    if (superkeysState === "ready") {
      const format = superkeyWriteFormat(currentDevice?.device.info.product);
      /* Keep unused Superkeys until the Superkeys page is gone, since it still names slots no key uses */
      const collect = false;
      const prepared = prepareSuperkeyWrite({
        draft: { ...refs, table: draftTable() },
        saved: skSaved.current,
        baseline: skBaseline.current,
        collect,
        format,
      });

      /* Refuse before any write, since the keyboard would play one of the clashing definitions on every key of a group */
      if (prepared.conflicts.length > 0) {
        const content = prepared.conflicts.map(conflict => conflictMessage(conflict, altRepeatRules)).join(" ");
        toast.error(
          <ToastMessage title={i18n.editor.multiAction.conflictTitle} content={content} icon={<IconArrowDownWithLine />} />,
          {
            autoClose: false,
            icon: "",
          },
        );
        return;
      }

      if (prepared.warnings.length > 0) {
        const content = [i18n.editor.multiAction.conflictWarning]
          .concat(prepared.warnings.map(conflict => conflictMessage(conflict, altRepeatRules)))
          .join(" ");
        toast.warn(
          <ToastMessage title={i18n.editor.multiAction.conflictTitle} content={content} icon={<IconArrowDownWithLine />} />,
          {
            autoClose: 8000,
            icon: "",
          },
        );
      }

      superkeysInput = {
        mode: "ready",
        format,
        prepared: { table: prepared.table, layers: prepared.layers },
        collect,
        draftRefs: { defaultLayers: refs.defaultLayers, layerOffset: refs.layerOffset, combos: refs.combos },
        saved: skSaved.current,
      };
    }

    const saveStart = holdSync.beginSave();
    let reloadHoldMods = false;

    try {
      setLoading(true);
      setIsSaving(true);
      const saveInput: LayoutSaveInput = {
        mode: holdSaveMode(),
        layers: custom,
        rules: altRepeatRules,
        rulesReady: altRepeatState === "ready",
        onlyCustom: keymap.onlyCustom,
        table: holdModsTable,
        saved: holdSaved.current,
        savedRules: savedAltRepeat.current,
        superkeys: superkeysInput,
      };
      const saved = await runLayoutSave(
        {
          writeHoldMods: list => writeHoldMods(currentDevice, list),
          writeKeymap: async (serialized, onlyCustom) => {
            log.info(`[KeyAssign] sending keymap.custom (${serialized.split(" ").length} codes)`);
            await writeUncached(currentDevice, "keymap.custom", serialized);
            await writeUncached(currentDevice, "keymap.onlyCustom", onlyCustom ? "1" : "0");
          },
          writeRules: rules => writeAltRepeatRules(currentDevice, rules, firmwareLayerCount(keymap), keysPerLayer()),
          writeSuperkeys: (table, format, storedRows) => writeSuperkeyTable(currentDevice, table, format, storedRows),
        },
        saveInput,
      );

      /* Keep what the keyboard may hold of the Superkeys also after a failed step */
      if (saved.superkeys) {
        skSaved.current = saved.superkeys.saved;
      }

      /* Keep a baseline a load read during the save, and read the keyboard again before allocating */
      if (holdSync.loadAppliedSince(saveStart)) {
        reloadHoldMods = true;
        setHoldModsState("loading");
      } else {
        holdSaved.current = saved.saved;
      }

      savedAltRepeat.current = saved.savedRules;

      if (saved.failed !== undefined) {
        log.error(`[LayoutEditor] save stopped at the ${saved.failed} step`, saved.error);

        if (saved.failed === "keymap" || saved.failed === "keymapAfterGc") {
          throw saved.error instanceof Error ? saved.error : new Error(String(saved.error));
        }

        throw new Error(saveFailedMessage(saved.failed));
      }

      /* Show the draft as saved, with orphan or unsupported partial codes made plain, merged Superkeys and unused entries dropped */
      if (reconcileDraft(custom, saved.layers).length > 0) {
        setKeymap({
          default: keymap.default,
          onlyCustom: keymap.onlyCustom,
          custom: keymap.custom.map((layer, l) =>
            layer.map((key, i) => (saved.layers[l][i] === key.keyCode ? key : keymapDB.parse(saved.layers[l][i]))),
          ),
        });
      }

      if (saved.rules !== saveInput.rules) {
        replaceRules(saved.rules);
      }

      if (saved.table !== holdModsTable) {
        setHoldModsTable(saved.table);
      }

      /* Name the Superkeys from their actions before the backup, which takes the names from the store */
      if (saved.superkeys) {
        const named = withGeneratedNames(saved.superkeys.table, labelCtx);
        setSuperkeys(named);
        storeSuperkeyNames(named);
        skBaseline.current = {
          customLayers: saved.layers,
          defaultLayers: refs.defaultLayers,
          layerOffset: refs.layerOffset,
          rules: altRepeatState === "ready" ? saved.rules : (skBaseline.current?.rules ?? []),
          combos: refs.combos,
          table: saved.superkeys.table,
        };
      }

      await updateColormap(currentDevice, colorMap);
      await updatePalette(currentDevice, palette);
      setCurrentLayer(currentLayer);
      setCurrentKeyIndex(currentKeyIndex);
      setCurrentLedIndex(currentLedIndex);
      setModified(false);
      setLeftSideModified(false);
      setIsMultiSelected(false);
      setSelectedPaletteColor(null);
      setIsColorButtonSelected(false);
      const commands = await Backup.Commands(currentDevice);
      const backup = await bkp.DoBackup(commands, neuronID, currentDevice);
      Backup.SaveBackup(backup, currentDevice);
      cancelContext();
      toast.success(
        <ToastMessage
          title={i18n.success.changesSaved}
          content={i18n.success.changesSavedContent}
          icon={<IconArrowDownWithLine />}
        />,
        {
          autoClose: 2000,
          icon: "",
        },
      );
      setLoading(false);
      setIsSaving(false);
      log.info("Changes saved.");
    } catch (error) {
      toast.error(
        <ToastMessage title="Error when saving" content={error?.message ?? String(error)} icon={<IconArrowDownWithLine />} />,
        {
          autoClose: 2000,
          icon: "",
        },
      );
      setLoading(false);
      setIsSaving(false);
    } finally {
      /* Run the load the save dropped or deferred, so the editor sees the keyboard as the save left it */
      if (holdSync.endSave() || reloadHoldMods) {
        loadHoldMods(currentDevice, currentDevice?.device.info.product);
      }
    }
  };

  const copyFromDialog = () => {
    setCopyFromOpen(true);
  };

  const cancelCopyFrom = () => {
    setCopyFromOpen(false);
  };

  const copyFromLayer = (layer: number) => {
    let nextRules: AltRepeatRule[] | null = null;

    if (altRepeatState === "ready") {
      /* Copy no rules from a default layer, which is read-only and has none */
      const sourceIsCustom = keymap.onlyCustom ? layer >= 0 : layer >= keymap.default.length;
      const copied = copyLayerRules(altRepeatRules, sourceIsCustom ? layer : null, currentLayer);

      if ("error" in copied) {
        showAltRepeatToast(i18n.editor.altRepeat.capacityRefused);
        setCopyFromOpen(false);
        return;
      }

      nextRules = copied.rules;
    }

    let newKeymap: KeyType[][];

    if (keymap.onlyCustom) {
      newKeymap = layer < 0 ? keymap.default.slice() : keymap.custom.slice();
      newKeymap[currentLayer] = layer < 0 ? keymap.default[layer + keymap.default.length].slice() : keymap.custom[layer].slice();
    } else {
      newKeymap = layer < keymap.default.length ? keymap.default.slice() : keymap.custom.slice();
      newKeymap[currentLayer] =
        layer < keymap.default.length ? keymap.default[layer].slice() : keymap.custom[layer - keymap.default.length].slice();
    }
    const newColormap = colorMap.slice();
    if (newColormap.length > 0) newColormap[currentLayer] = colorMap[layer >= 0 ? layer : currentLayer].slice();

    setColorMap(newColormap);
    setCopyFromOpen(false);
    setModified(true);
    startContext();
    setKeymap({
      default: keymap.default,
      onlyCustom: keymap.onlyCustom,
      custom: newKeymap,
    });

    if (nextRules !== null) {
      replaceRules(nextRules);
    }
  };

  const applyColorMapChangeBL = (side: string, colorIndex: number) => {
    const { currentDevice } = state;
    const idx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;
    const layerMap = { keys: currentDevice.device.keyboard, underglow: currentDevice.device.keyboardUnderglow };
    const newColormap = colorMap.slice();

    log.info(newColormap[idx]);
    if (newColormap.length > 0) {
      if (side === "LEFT") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.keys.ledsLeft[0],
          layerMap.keys.ledsLeft[layerMap.keys.ledsLeft.length - 1] + 1,
        );
      }

      if (side === "RIGHT") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.keys.ledsRight[0],
          layerMap.keys.ledsRight[layerMap.keys.ledsRight.length - 1] + 1,
        );
      }

      if (side === "BOTH") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.keys.ledsLeft[0],
          layerMap.keys.ledsLeft[layerMap.keys.ledsLeft.length - 1] + 1,
        );
        newColormap[idx].fill(
          colorIndex,
          layerMap.keys.ledsRight[0],
          layerMap.keys.ledsRight[layerMap.keys.ledsRight.length - 1] + 1,
        );
      }
      log.info(newColormap[idx]);
    }
    setColorMap(newColormap);
    setModified(true);
    startContext();
  };

  const applyColorMapChangeUG = (side: string, colorIndex: number) => {
    const { currentDevice } = state;
    const idx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;
    const layerMap = { keys: currentDevice.device.keyboard, underglow: currentDevice.device.keyboardUnderglow };
    const newColormap = colorMap.slice();

    log.info(newColormap[idx]);
    if (newColormap.length > 0) {
      if (side === "LEFT") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.underglow.ledsLeft[0],
          layerMap.underglow.ledsLeft[layerMap.underglow.ledsLeft.length - 1] + 1,
        );
      }

      if (side === "RIGHT") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.underglow.ledsRight[0],
          layerMap.underglow.ledsRight[layerMap.underglow.ledsRight.length - 1] + 1,
        );
      }

      if (side === "BOTH") {
        newColormap[idx].fill(
          colorIndex,
          layerMap.underglow.ledsLeft[0],
          layerMap.underglow.ledsLeft[layerMap.underglow.ledsLeft.length - 1] + 1,
        );
        newColormap[idx].fill(
          colorIndex,
          layerMap.underglow.ledsRight[0],
          layerMap.underglow.ledsRight[layerMap.underglow.ledsRight.length - 1] + 1,
        );
      }
      log.info(newColormap[idx]);
    }
    setColorMap(newColormap);
    setModified(true);
    startContext();
  };

  const clearLayer = (fillKeyCode = BlankTable.keys[1].code, colorIndex = 15, chooseYourKeyboardSide = "BOTH") => {
    const { currentDevice } = state;
    const layerMap = { keys: currentDevice.device.keyboard, underglow: currentDevice.device.keyboardUnderglow };
    const newKeymap = keymap.custom.slice();
    const idx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;
    const keyCodeFiller = keymapDB.parse(fillKeyCode);
    const cloneLayer = [...newKeymap[idx]];

    log.info(cloneLayer);
    if (chooseYourKeyboardSide === "LEFT") {
      layerMap.keys.left.forEach(value => {
        console.log("erasing values: ", value, value[0], value[value.length - 1] + 1);
        cloneLayer.fill(keyCodeFiller, value[0], value[value.length - 1] + 1);
      });
    }

    if (chooseYourKeyboardSide === "RIGHT") {
      layerMap.keys.right.forEach(value => {
        cloneLayer.fill(keyCodeFiller, value[0], value[value.length - 1] + 1);
      });
    }

    if (chooseYourKeyboardSide === "BOTH") {
      cloneLayer.fill(keyCodeFiller);
    }
    log.info("new clone layer", cloneLayer);
    newKeymap[idx] = cloneLayer;

    if (altRepeatState === "ready") {
      let positions: Set<number> | undefined;

      if (chooseYourKeyboardSide !== "BOTH") {
        /* Use the row ranges the fill above clears */
        const rows = chooseYourKeyboardSide === "LEFT" ? layerMap.keys.left : layerMap.keys.right;
        positions = new Set<number>();

        rows.forEach(row => {
          for (let position = row[0]; position <= row[row.length - 1]; position += 1) {
            positions.add(position);
          }
        });
      }

      replaceRules(clearLayerRules(altRepeatRules, currentLayer, positions));
    }

    startContext();
    if (colorIndex >= 0) {
      applyColorMapChangeBL(chooseYourKeyboardSide, colorIndex);
      applyColorMapChangeUG(chooseYourKeyboardSide, colorIndex);
    }
    setClearConfirmationOpen(false);
    setModified(true);
    startContext();
    setKeymap({
      default: keymap.default,
      onlyCustom: keymap.onlyCustom,
      custom: newKeymap,
    });
  };

  const confirmClear = () => {
    setClearConfirmationOpen(true);
  };

  const cancelClear = () => {
    setClearConfirmationOpen(false);
  };

  const onColorButtonSelect = (action: string, colorIndex: number) => {
    if (action === "one_button_click") {
      setIsMultiSelected(false);
      setIsColorButtonSelected(!isColorButtonSelected);
      return;
    }
    if (action === "another_button_click") {
      setSelectedPaletteColor(colorIndex);
      setIsColorButtonSelected(true);
    }
  };

  const onColorSelect = (colorIndex: number) => {
    const { currentDevice } = state;
    const isEqualColor = onVerificationColor(colorIndex, currentLayer, currentLedIndex);
    // log.info(
    //   "data from onColorSelect",
    //   isEqualColor,
    //   currentLayer,
    //   colorMap.length,
    //   currentLedIndex,
    //   colorIndex,
    //   selectedPaletteColor,
    //   currentKeyIndex,
    // );

    if (currentLayer < 0 || currentLayer >= colorMap.length) return;

    if (!isEqualColor && currentKeyIndex >= 0) {
      const colormap = colorMap.slice();
      colormap[currentLayer][currentLedIndex] = colorIndex;
      if (currentDevice.device.keyboard.ledsLeft.includes(currentLedIndex)) setLeftSideModified(true);
      setIsMultiSelected(true);
      setColorMap(colorMap);
      setSelectedPaletteColor(colorIndex);
      setModified(true);
      startContext();
    }
    if (colorIndex !== selectedPaletteColor) {
      setSelectedPaletteColor(colorIndex);
    } else {
      setSelectedPaletteColor(-1);
    }
  };

  const onColorPick = (colorIndex: number, r: number, g: number, b: number) => {
    const newPalette = palette.slice();
    const setColors = (red: number, green: number, blue: number) => ({
      r: red,
      g: green,
      b: blue,
      rgb: `rgb(${red}, ${green}, ${blue})`,
    });
    newPalette[colorIndex] = setColors(r, g, b);
    setPalette(newPalette);
    setModified(true);
    startContext();
  };

  const importLayer = (data: {
    device?: DygmaDeviceInfoType;
    language?: string;
    layerNames: LayerType[];
    layerName?: string;
    keymap: KeyType[];
    colormap: number[];
    palette: PaletteType[];
    altRepeat?: AltRepeatLayerEntry[];
    holdMods?: unknown;
  }): boolean => {
    const { currentDevice } = state;
    const replacesLayer =
      data.keymap.length > 0 &&
      data.colormap.length > 0 &&
      (keymap.onlyCustom ? currentLayer >= 0 : currentLayer >= keymap.default.length);
    let nextRules: AltRepeatRule[] | null = null;

    /* Refuse before any change while the table is unknown, since an imported partial code may mean another choice here */
    if (replacesLayer && holdModsState !== "unsupported" && !holdModsSettled) {
      showHoldModsToast(holdModsState === "failed" ? i18n.editor.holdMods.loadFailed : i18n.editor.holdMods.notLoaded);
      return false;
    }

    /* Settle the rules first, so a refused import changes nothing */
    if (replacesLayer && altRepeatState === "ready") {
      const sameProduct = data.device?.product === currentDevice?.device.info.product;

      if (sameProduct && Array.isArray(data.altRepeat)) {
        const replaced = replaceLayerRules(
          altRepeatRules,
          currentLayer,
          data.altRepeat,
          keysPerLayer(),
          Boolean(store.get("capabilities.altRepeatKeyRepeat")),
        );

        if ("error" in replaced) {
          showAltRepeatToast(i18n.editor.altRepeat.capacityRefused);
          return false;
        }

        nextRules = replaced.rules;

        if (replaced.dropped > 0) {
          showAltRepeatToast(i18n.editor.altRepeat.importDropped);
        }
      } else if (rulesOnLayer(currentLayer) > 0) {
        nextRules = clearLayerRules(altRepeatRules, currentLayer);
        showAltRepeatToast(i18n.editor.altRepeat.importCleared);
      }
    }

    log.info("not loading the palette: ", palette);
    // if (data.palette.length > 0) state.palette = data.palette;
    let cleanKeymap: KeyType[];
    let cleanColormap: number[];
    if (currentDevice?.device.info.product === "Raise2" && (data.device?.product === "Raise" || data.colormap.length === 132)) {
      cleanKeymap = convertKeymapRtoR2(
        data.keymap.map(k => k.keyCode),
        currentDevice?.device.info.keyboardType,
      ).map(k => keymapDB.parse(k));
      cleanColormap = convertColormapRtoR2(data.colormap, currentDevice?.device.info.keyboardType, "Raise");
    } else {
      cleanKeymap = data.keymap.map(key => {
        let localKey = key;
        if (typeof localKey.extraLabel === "object" || typeof localKey.label === "object")
          localKey = keymapDB.parse(localKey.keyCode);
        return localKey;
      });
      cleanColormap = data.colormap;
    }

    let nextHoldMods: HoldModsEntry[] | null = null;

    /* Fit the imported partial codes into the table, and keep every code the other layers, their rules or the keyboard use */
    if (replacesLayer) {
      const customIdx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;
      const rules = nextRules ?? altRepeatRules;
      const importedRules = rules.filter(rule => rule.layer === currentLayer);
      const used = usedHoldCodes(
        draftCodes(keymap.custom.filter((_, idx) => idx !== customIdx)),
        rules.filter(rule => rule.layer !== currentLayer),
        holdSaved.current,
      );
      const fitted = fitHoldImport(
        holdModsState !== "unsupported",
        holdModsTable,
        used,
        cleanKeymap.map(key => key.keyCode).concat(importedRules.map(rule => rule.output)),
        data.holdMods,
      );

      if ("error" in fitted) {
        showHoldModsToast(i18n.editor.holdMods.importRefused);
        return false;
      }

      if (fitted.remap.size > 0) {
        cleanKeymap = cleanKeymap.map(key =>
          fitted.remap.has(key.keyCode) ? keymapDB.parse(fitted.remap.get(key.keyCode)) : key,
        );
        nextRules = rules.map(rule =>
          rule.layer === currentLayer && fitted.remap.has(rule.output)
            ? { ...rule, output: fitted.remap.get(rule.output) }
            : rule,
        );
      }

      if (fitted.normalized) {
        showHoldModsToast(i18n.editor.holdMods.importNormalized);
      }

      nextHoldMods = fitted.table;
    }

    const lNames = layerNames.slice();
    if (data.layerNames !== null) {
      if (data.layerName && currentLayer) {
        lNames[currentLayer] = { name: data.layerName, id: currentLayer };
      }
      setLayerNames(lNames);
    }
    if (data.keymap.length > 0 && data.colormap.length > 0) {
      if (keymap.onlyCustom) {
        if (currentLayer >= 0) {
          const newKeymap = keymap.custom.slice();
          newKeymap[currentLayer] = cleanKeymap;
          const newColormap = colorMap.slice();
          newColormap[currentLayer] = cleanColormap;
          setKeymap({
            default: keymap.default,
            custom: newKeymap,
            onlyCustom: keymap.onlyCustom,
          });
          setColorMap(newColormap);
        }
      } else if (currentLayer >= keymap.default.length) {
        const defLength = keymap.default.length;
        const newKeymap = keymap.custom.slice();
        newKeymap[currentLayer - defLength] = cleanKeymap;
        const newColormap = colorMap.slice();
        newColormap[currentLayer - defLength] = cleanColormap;

        setKeymap({
          default: keymap.default,
          custom: newKeymap,
          onlyCustom: keymap.onlyCustom,
        });
        setColorMap(newColormap);
      }
    }

    if (nextRules !== null) {
      replaceRules(nextRules);
    }

    if (nextHoldMods !== null) {
      editHoldMods(nextHoldMods);
    }

    setModified(true);
    startContext();
    return true;
  };

  const toChangeAllKeysColor = (colorIndex: number, start: number, end: number) => {
    const colormap = colorMap.slice();
    colormap[currentLayer] = colormap[currentLayer].fill(colorIndex, start, end);
    setLeftSideModified(true);
    setColorMap(colormap);
    setModified(true);
    startContext();
  };

  const getLayout = () => {
    const { currentDevice } = state;
    let Layer = null;
    let kbtype = "iso";
    if (currentDevice?.device === null) return { Layer: undefined, kbtype: undefined };
    try {
      Layer = currentDevice?.device.components.keymap as React.FC<any>;
      kbtype = currentDevice?.device && currentDevice?.device.info.keyboardType === "ISO" ? "iso" : "ansi";
      // log.info("Got Layer: ", Layer, kbtype);
    } catch (error) {
      log.error("Focus lost connection to Raise: ", error);
      return { Layer: undefined, kbtype: undefined };
    }

    return { Layer, kbtype };
  };

  const toImport = async () => {
    const options = {
      title: "Load Layer/s file",
      buttonLabel: "Load Layer/s",
      filters: [
        { name: "Json", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };

    const resp = await ipcRenderer.invoke("open-dialog", options);
    if (!resp.canceled) {
      // log.info(resp.filePaths);
      let layers;
      try {
        layers = JSON.parse(fs.readFileSync(resp.filePaths[0], "utf-8"));
        // log.info(layers, Array.isArray(layers.keymap));
        if (Array.isArray(layers.keymap)) {
          // log.info(layers.keymap[0]);
          if (!importLayer(layers)) {
            return;
          }

          toast.success(
            <ToastMessage
              title={i18n.editor.importSuccessCurrentLayerTitle}
              content={i18n.editor.importSuccessCurrentLayer}
              icon={<IconArrowDownWithLine />}
            />,
            {
              autoClose: 2000,
              icon: "",
            },
          );
        } else {
          // log.info(layers.keymap.custom[0]);
          let nextRules: AltRepeatRule[] | null = null;

          if (holdModsState !== "unsupported" && !holdModsSettled) {
            showHoldModsToast(holdModsState === "failed" ? i18n.editor.holdMods.loadFailed : i18n.editor.holdMods.notLoaded);
            return;
          }

          if (altRepeatState === "ready") {
            const replaced = replaceAllRules(
              Array.isArray(layers.altRepeat) ? layers.altRepeat : [],
              firmwareLayerCount(keymap),
              keysPerLayer(),
              Boolean(store.get("capabilities.altRepeatKeyRepeat")),
            );

            if ("error" in replaced) {
              showAltRepeatToast(i18n.editor.altRepeat.capacityRefused);
              return;
            }

            if (replaced.dropped > 0) {
              showAltRepeatToast(i18n.editor.altRepeat.importDropped);
            } else if (replaced.rules.length === 0 && altRepeatRules.length > 0) {
              showAltRepeatToast(i18n.editor.altRepeat.importCleared);
            }

            nextRules = replaced.rules;
          }

          /* Replace every layer, so only the rules kept from before and the codes the keyboard may hold stay in use */
          const importedKeymap = layers.keymap as KeymapType;
          const used = usedHoldCodes([], nextRules === null ? altRepeatRules : [], holdSaved.current);
          const fitted = fitHoldImport(
            holdModsState !== "unsupported",
            holdModsTable,
            used,
            draftCodes(importedKeymap.custom)
              .flat()
              .concat((nextRules ?? []).map(rule => rule.output)),
            layers.holdMods,
          );

          if ("error" in fitted) {
            showHoldModsToast(i18n.editor.holdMods.importRefused);
            return;
          }

          if (fitted.remap.size > 0) {
            importedKeymap.custom = importedKeymap.custom.map(layer =>
              layer.map(key => (fitted.remap.has(key.keyCode) ? keymapDB.parse(fitted.remap.get(key.keyCode)) : key)),
            );
          }

          /* Remap only imported rules. Kept rules keep their codes and meanings */
          if (fitted.remap.size > 0 && nextRules !== null) {
            nextRules = nextRules.map(rule =>
              fitted.remap.has(rule.output) ? { ...rule, output: fitted.remap.get(rule.output) } : rule,
            );
          }

          if (fitted.normalized) {
            showHoldModsToast(i18n.editor.holdMods.importNormalized);
          }

          setLayerNames(layers.layerNames);
          setKeymap(importedKeymap);
          setColorMap(layers.colormap);
          setPalette(layers.palette);
          /* Keep the keyboard's Superkeys, which the imported keys play until the file's own are copied in */

          if (nextRules !== null) {
            replaceRules(nextRules);
          }

          editHoldMods(fitted.table);
          setModified(true);
          startContext();
          toast.success(i18n.editor.importSuccessAllLayers, {
            autoClose: 2000,
          });
        }
      } catch (e) {
        log.error(e);
        toast.error(
          <ToastMessage
            title={i18n.errors.preferenceFailOnSave}
            content={i18n.errors.invalidLayerFile}
            icon={<IconArrowDownWithLine />}
          />,
          {
            autoClose: 2000,
            icon: "",
          },
        );
      }
    } else {
      log.info("user closed SaveDialog");
    }
  };

  const toExport = async () => {
    /* Refuse the export, since a file without the unknown rules would clear them on import */
    if (altRepeatState === "failed") {
      showAltRepeatToast(i18n.editor.altRepeat.loadFailed);
      return;
    }

    /* Refuse the export, since a file without the held modifiers would import its partial codes as plain shortcuts */
    if (holdModsState !== "unsupported" && !holdModsSettled) {
      showHoldModsToast(holdModsState === "failed" ? i18n.editor.holdMods.loadFailed : i18n.editor.holdMods.notLoaded);
      return;
    }

    let localLayerData;
    let localIsReadOnly;
    if (keymap.onlyCustom) {
      localIsReadOnly = currentLayer < 0;
      localLayerData = localIsReadOnly ? keymap.default[currentLayer + keymap.default.length] : keymap.custom[currentLayer];
    } else {
      localIsReadOnly = currentLayer < keymap.default.length;
      localLayerData = localIsReadOnly ? keymap.default[currentLayer] : keymap.custom[currentLayer - keymap.default.length];
    }
    const { currentDevice } = state;
    const info = currentDevice?.device.info;
    const data = JSON.stringify(
      {
        device: info,
        language: currentLanguageLayout,
        layerNames,
        keymap: localLayerData,
        colormap: colorMap[currentLayer],
        palette,
        ...(altRepeatState === "ready"
          ? {
              altRepeat: altRepeatRules
                .filter(rule => rule.layer === currentLayer)
                .map(({ position, previous, output }) => ({ position, previous, output })),
            }
          : {}),
        ...(holdModsSettled
          ? {
              holdMods: layerHoldModsExport(
                holdModsTable,
                (localLayerData ?? [])
                  .map((key: KeyType) => key.keyCode)
                  .concat(altRepeatRules.filter(rule => rule.layer === currentLayer).map(rule => rule.output)),
              ),
            }
          : {}),
      },
      null,
      2,
    );
    const options = {
      title: "Save Layer file",
      defaultPath: `${layerNames[currentLayer].name}.json`,
      buttonLabel: "Save Layer",
      filters: [
        { name: "Json", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };

    try {
      const path = await ipcRenderer.invoke("save-dialog", options);
      if (typeof path !== "undefined") {
        log.info("path & data to export to: ", path, data);
        fs.writeFileSync(path, data);
        toast.success(
          <ToastMessage
            title={i18n.editor.exportSuccessCurrentLayer}
            content={i18n.editor.exportSuccessCurrentLayerContent}
            icon={<IconArrowUpWithLine />}
          />,
          {
            autoClose: 2000,
            icon: "",
          },
        );
      } else {
        log.info("user closed SaveDialog");
      }
    } catch (error) {
      log.error(error);
      toast.error(
        <ToastMessage
          title={i18n.errors.exportFailed}
          content={i18n.errors.exportError + error}
          icon={<IconArrowUpWithLine />}
        />,
        {
          autoClose: 2000,
          icon: "",
        },
      );
    }
  };

  const toggleNeuronModal = () => {
    if (showNeuronModal) {
      // TODO: Find out why savedReject.reject("cancelled"); is not present anywhere else
    }
    setShowNeuronModal(!showNeuronModal);
  };

  const CloneExistingNeuron = () => {
    // TODO: Find out why  savedResolve.resolve("resolved"); is not present anywhere else
    toast.success("added additional neuron to this Bazecor installation");
    setShowNeuronModal(false);
  };

  const toggleMacroModal = () => {
    setShowMacroModal(!showMacroModal);
  };

  const updateOldMacros = () => {
    const localKeymap = { ...keymap };
    const layers = [];
    const oldmacro = [...Array(64).keys()].map(x => x + 24576);
    for (let index = 0; index < localKeymap.custom.length; index += 1) {
      if (localKeymap.custom[index].some((r: { keyCode: number }) => oldmacro.includes(r.keyCode))) {
        layers.push(index);
      }
    }
    for (let index = 0; index < layers.length; index += 1) {
      for (let idx = 0; idx < localKeymap.custom[layers[index]].length; idx += 1) {
        if (oldmacro.includes(localKeymap.custom[layers[index]][idx].keyCode)) {
          localKeymap.custom[layers[index]][idx] = keymapDB.parse(localKeymap.custom[layers[index]][idx].keyCode + 29276);
        }
      }
    }
    setShowMacroModal(false);
    setModified(true);
    setKeymap(localKeymap);
    startContext();
    onApply();
  };

  const layerName = (index: number): string =>
    layerNames !== undefined && layerNames.length > index ? layerNames[index]?.name : defaultLayerNames[index]?.name;

  const modeSelectToggle = (data: ModeType) => {
    setSelectedPaletteColor(null);
    setIsColorButtonSelected(false);
    setCurrentLedIndex(-1);
    setCurrentKeyIndex(-1);
    setModeselect(data);
  };

  const exportToPdf = () => {
    toast.info(
      <ToastMessage
        title="Feature not yet ready!"
        content="The feature is not yet ready. its being worked on!"
        icon={<IconArrowUpWithLine />}
      />,
      {
        autoClose: 2000,
        icon: "",
      },
    );
  };

  const resetScroll = () => {
    setMouseWheel(0);
  };

  const updateScroll = useCallback((e: WheelEvent) => {
    // log.info("Scroll WHEEL event!", e);
    const direction = e.deltaY > 0 ? 1 : -1;
    if (!(e.target as HTMLElement).outerHTML.includes('<div role="option"')) setMouseWheel(direction);
  }, []);

  useEffect(() => {
    window.addEventListener("mousewheel", updateScroll);

    // log.info("going to RUN INITIAL USE EFFECT just ONCE");
    const scanner = async () => {
      await scanKeyboard(currentLanguageLayout);
      const newLanguage = getLanguage(store.get("settings.language") as string);
      log.info("Language automatically set to: ", newLanguage);
      setCurrentLanguageLayout(newLanguage || "english");
      setLoading(false);
      setCurrentLayer(0);
      scanned.current = true;
    };

    if (!scanned.current) {
      scanner();
    }

    return () => {
      window.removeEventListener("mousewheel", updateScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // log.info("Running Scanner on changes useEffect: ", inContext, modified, !scanned, !inContext && modified && !scanned);
    if (!inContext && modified && !scanned.current) {
      const scanner = async () => {
        log.info("Resseting KB Data!!!");
        setModified(false);
        setLeftSideModified(false);
        setLoading(true);
        setCurrentLayer(previousLayer !== 0 ? previousLayer : 0);
        setPreviousLayer(0);
        setCurrentKeyIndex(-1);
        setCurrentLedIndex(-1);
        setKeymap({
          custom: [],
          default: [],
          onlyCustom: false,
        });
        setPalette([]);
        scanned.current = true;
        await scanKeyboard(currentLanguageLayout);
        setLoading(false);
      };
      scanner();
    }
  }, [currentLanguageLayout, inContext, keymap.custom, modified, previousLayer, scanKeyboard, scanned, setLoading]);

  useEffect(() => {
    // log.info("Running LayerData useEffect");
    const localShowDefaults = store.get("settings.showDefaults") as boolean;
    let cLayer = currentLayer;

    if (!localShowDefaults) {
      if (currentLayer < keymap.default.length && !keymap.onlyCustom) {
        cLayer = 0;
      }
    }

    let localLayerData: KeyType[];
    let localIsReadOnly;
    if (keymap.onlyCustom) {
      localIsReadOnly = cLayer < 0;
      localLayerData = localIsReadOnly ? keymap.default[cLayer + keymap.default.length] : keymap.custom[cLayer];
    } else {
      localIsReadOnly = cLayer < keymap.default.length;
      localLayerData = localIsReadOnly ? keymap.default[cLayer] : keymap.custom[cLayer - keymap.default.length];
    }

    if (localLayerData !== undefined) {
      localLayerData = localLayerData.map(key => {
        const newMKey = key;
        if (key.extraLabel === "MACRO") {
          const MNumber = key.keyCode - 53852;
          if (
            macros[MNumber] !== undefined &&
            macros[MNumber].name !== undefined &&
            macros[MNumber].name.substring(0, 5) !== "" &&
            typeof key.label === "string" &&
            !/\p{L}/u.test(key.label)
          ) {
            log.info("macros:", macros);
            newMKey.label = macros[MNumber].name.substring(0, 5);
          }
        }
        return newMKey;
      });
    }

    /* Label Superkeys from the draft's actions, on copies so the label follows every edit */
    if (localLayerData !== undefined) {
      localLayerData = localLayerData.map(key => {
        if (key.extraLabel !== "SUPER") {
          return key;
        }

        const slot = key.keyCode - SUPERKEY_FIRST;
        return { ...key, label: superkeyFace(superkeys?.[slot]?.actions, slot, labelCtx) };
      });
    }
    // log.info("SAVING USEFFECT!!:", localLayerData, localIsReadOnly, localShowDefaults, cLayer);
    setLayerData(localLayerData);
    setIsReadOnly(localIsReadOnly);
    setShowDefaults(localShowDefaults);
    setCurrentLayer(cLayer);
  }, [keymap, currentLayer, macros, superkeys, labelCtx]);

  useEffect(() => {
    setAltRepeatTab(-1);
  }, [currentLayer, currentKeyIndex]);

  /* Reload the rules when App reads the capabilities again after the scan, as after a firmware update, and they disagree with
   * what the scan found. Skip the mount, where the scan loads them */
  const seenCapabilitiesRefresh = useRef(capabilitiesRefresh);

  useEffect(() => {
    if (capabilitiesRefresh === seenCapabilitiesRefresh.current) {
      return;
    }

    seenCapabilitiesRefresh.current = capabilitiesRefresh;
    const { currentDevice } = state;
    const supported = Boolean(store.get("capabilities.altRepeat"));

    if (supported === (altRepeatState !== "unsupported") || !currentDevice || currentDevice.isClosed) {
      return;
    }

    loadAltRepeatRules(currentDevice);
  }, [capabilitiesRefresh, altRepeatState, state, loadAltRepeatRules]);

  /* Reload the table when App reads the capabilities again and they disagree with it, or while its last load could not read the keyboard */
  const seenHoldModsRefresh = useRef(capabilitiesRefresh);

  useEffect(() => {
    if (capabilitiesRefresh === seenHoldModsRefresh.current) {
      return;
    }

    seenHoldModsRefresh.current = capabilitiesRefresh;
    const { currentDevice } = state;
    const listed = Boolean(store.get("capabilities.holdMods"));
    const agrees = holdModsState !== "loading" && listed === (holdModsState !== "unsupported");

    if (agrees || !currentDevice || currentDevice.isClosed || holdSync.loading()) {
      return;
    }

    loadHoldMods(currentDevice, currentDevice.device.info.product);
  }, [capabilitiesRefresh, holdModsState, state, loadHoldMods, holdSync]);

  /* Retry a load that could not read the keyboard or the table once each time a key is picked, so the row shows without a rescan */
  useEffect(() => {
    const { currentDevice } = state;

    if (!holdModsRetryWanted(holdModsState, currentKeyIndex, holdSync.loading()) || !currentDevice || currentDevice.isClosed) {
      return;
    }

    loadHoldMods(currentDevice, currentDevice.device.info.product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKeyIndex, currentLayer]);

  const onReloadAltRepeat = async () => {
    cancelContext();
    setModified(false);
    scanned.current = false;
    await scanKeyboard(currentLanguageLayout);
  };

  const { Layer } = getLayout();
  if (!Layer) {
    return <div />;
  }

  const copyCustomItems = keymap
    ? keymap.custom.map((_: unknown, id: number) => {
        const idx = id + (keymap.onlyCustom ? 0 : keymap.default.length);
        const label = `${(idx + 1).toString()}: ${layerName(idx)}`;
        return {
          id: idx,
          name: label,
        };
      })
    : [];

  const copyDefaultItems =
    showDefaults && keymap
      ? keymap.default.map((_, index) => {
          const idx = index - (keymap.onlyCustom ? keymap.default.length : 0);
          const label = idx.toString();
          return {
            id: idx,
            name: label,
          };
        })
      : [];
  const copyFromLayerOptions = (copyDefaultItems || []).concat(copyCustomItems);

  const layerMenu =
    keymap && keymap.custom.length > 0
      ? keymap.custom.map((_, index) => {
          const idx = index + (keymap.onlyCustom ? 0 : keymap.default.length);
          return {
            name: layerName(idx),
            id: idx,
          };
        })
      : [];

  let code: SegmentedKeyType = {
    base: 0,
    modified: 0,
  };
  if (currentKeyIndex !== -1 && currentKeyIndex < ledIndexStart) {
    const tempkey = keymapDB.parse(layerData[currentKeyIndex].keyCode);
    // log.info("Key to be used in render", tempkey);
    code = keymapDB.keySegmentor(tempkey.keyCode);
  }

  const defaultKeyCode = code.base + code.modified;
  const keyRules = currentKeyIndex === -1 ? [] : rulesAt(altRepeatRules, currentLayer, currentKeyIndex);
  const selectedRuleIdx = altRepeatTab >= 0 && altRepeatTab < keyRules.length ? keyRules[altRepeatTab] : -1;
  const selectedRule = selectedRuleIdx === -1 ? null : altRepeatRules[selectedRuleIdx];
  const defaultBlock = altRepeatDefaultBlock(defaultKeyCode, superkeys);
  const showAltRepeat =
    altRepeatState !== "unsupported" && !isReadOnly && currentKeyIndex !== -1 && currentKeyIndex < ledIndexStart;

  const onConfirmPrevious = (previous: number) => {
    const { ruleIndex } = previousDialog;
    setPreviousDialog({ open: false, ruleIndex: null });

    if (ruleIndex !== null) {
      editRules(
        altRepeatRules.map((rule, index) =>
          index === ruleIndex ? { ...rule, previous: withRepeat(previous, hasRepeat(rule.previous)) } : rule,
        ),
      );
      return;
    }

    if (altRepeatRules.length >= MAX_ALT_REPEAT_RULES) {
      return;
    }

    /* Start from the default so the new tab only needs the change */
    const output = isAllowedOutput(defaultKeyCode) ? defaultKeyCode : 4;
    editRules(altRepeatRules.concat([{ layer: currentLayer, position: currentKeyIndex, previous, output }]));
    setAltRepeatTab(keyRules.length);
  };

  const onDeleteRule = () => {
    if (selectedRuleIdx === -1) {
      return;
    }

    editRules(altRepeatRules.filter((_, index) => index !== selectedRuleIdx));
    setAltRepeatTab(-1);
  };

  const onToggleRepeat = () => {
    if (selectedRuleIdx === -1) {
      return;
    }

    editRules(
      altRepeatRules.map((rule, index) =>
        index === selectedRuleIdx ? { ...rule, previous: withRepeat(rule.previous, !hasRepeat(rule.previous)) } : rule,
      ),
    );
  };

  const onRuleOutputChange = (keyCode: number) => {
    if (selectedRuleIdx === -1 || !isAllowedOutput(keyCode) || keyCode === altRepeatRules[selectedRuleIdx].output) {
      return;
    }

    editRules(altRepeatRules.map((rule, index) => (index === selectedRuleIdx ? { ...rule, output: keyCode } : rule)));
  };

  const customLayerIdx = keymap.onlyCustom ? currentLayer : currentLayer - keymap.default.length;

  const onCellHoldChange = (shortcut: number, held: number): boolean => {
    const keyCode = allocateHold(shortcut, held, { layer: customLayerIdx, position: currentKeyIndex });

    if (keyCode === null) {
      return false;
    }

    onKeyChange(keyCode);
    return true;
  };

  const onRuleHoldChange = (shortcut: number, held: number): boolean => {
    const keyCode = selectedRuleIdx === -1 ? null : allocateHold(shortcut, held, { rule: selectedRuleIdx });

    if (keyCode === null) {
      return false;
    }

    onRuleOutputChange(keyCode);
    return true;
  };

  const holdPicker = {
    layer: currentLayer,
    altRepeatLayerHold: Boolean(store.get("capabilities.altRepeatLayerHold")),
    state: holdModsState,
    settled: holdModsSettled,
  };
  const cellHoldProps = holdPickerProps({
    ...holdPicker,
    context: "cell",
    heldMask: heldMaskOf(holdModsTable, defaultKeyCode),
    onHoldChange: onCellHoldChange,
  });
  const ruleHoldProps = holdPickerProps({
    ...holdPicker,
    context: "rule",
    heldMask: selectedRule === null ? 0 : heldMaskOf(holdModsTable, selectedRule.output),
    onHoldChange: onRuleHoldChange,
  });

  /* The Multi-action tab for the selected cell. Default layers are read-only and keep the Superkeys tab */
  const cellMultiAction = (): MultiActionProps | undefined => {
    const cellCode = keymap.custom[customLayerIdx]?.[currentKeyIndex]?.keyCode;

    if (isReadOnly || currentKeyIndex === -1 || currentKeyIndex >= ledIndexStart || cellCode === undefined) {
      return undefined;
    }

    const table = draftTable();
    const refs = superkeyRefs(draftRefs(draftCodes(keymap.custom), altRepeatRules));
    const slot = superkeySlot(cellCode);
    const dualUse = decodeDualUse(cellCode);
    let actions = normalizeActions([cellCode === 0 || cellCode === TRANSPARENT_KEY ? IDLE_ACTION : cellCode]);
    let storage: MultiActionStorage = "plain";
    let notice: string | undefined;

    if (slot !== null) {
      storage = "superkey";

      if (slot >= MAX_ACTIVE_SUPERKEYS) {
        actions = normalizeActions(superkeysBeyond.get(slot));
        notice = i18n.editor.multiAction.beyondLimit
          .replace("{slot}", String(slot + 1))
          .replace("{max}", String(MAX_ACTIVE_SUPERKEYS));
      } else if (slot >= table.length) {
        actions = normalizeActions([]);
        notice = i18n.editor.multiAction.undefinedSlot.replace("{slot}", String(slot + 1));
      } else {
        actions = table[slot];
      }
    } else if (dualUse !== null) {
      storage = "dualUse";
      actions = normalizeActions([dualUse.tap, dualUse.hold]);
    }

    const users = slot === null ? [] : (refs.get(slot) ?? []).map(ref => refName(ref, altRepeatRules, defaultCellName));
    const used = new Set([...refs.keys(), ...protectedSlots(skSaved.current)].filter(s => s < MAX_ACTIVE_SUPERKEYS)).size;

    return {
      mode: superkeysState === "unsupported" ? "dualUseOnly" : "full",
      context: "cell",
      actions,
      storage,
      slot: slot !== null && slot < MAX_ACTIVE_SUPERKEYS ? slot : null,
      users,
      capacity: { used, max: MAX_ACTIVE_SUPERKEYS },
      disabledReason: multiActionBlock(),
      notice,
      actionLabel: action => actionText(action, labelCtx),
      onChange: onMultiActionChange,
    };
  };

  const takenPreviousCodes = keyRules
    .filter(index => index !== previousDialog.ruleIndex)
    .map(index => basePrevious(altRepeatRules[index].previous));

  // log.info("execution that may not render");
  if (layerData === undefined || layerData.length < 1) return <LoaderLayout steps={scanningStep} />;
  // log.info("GOING TO RENDER!!!");

  const layer = (
    // TODO: restore fade effect <fade in appear key={currentLayer}>
    <div className="LayerHolder">
      <Layer
        readOnly={isReadOnly}
        index={currentLayer}
        keymap={layerData}
        onKeySelect={onKeySelect}
        selectedKey={currentKeyIndex}
        selectedLED={currentLedIndex}
        palette={palette}
        colormap={colorMap[currentLayer]}
        darkMode={darkMode}
        style={{ width: "65vw" }}
        showUnderglow={modeselect !== "keyboard"}
        className={`svg-${deviceName.toLowerCase()} raiseKeyboard layer h-auto`}
        isStandardView={false}
      />
    </div>
    // </fade>
  );

  return (
    <Styles className="layoutEditor h-full">
      {/* One rule per key that belongs to a combo on the layer shown; see
       * comboBadges.ts for why this is a stylesheet rather than a prop on the
       * key component. */}
      <style>{comboBadgeStyles(combos, currentLayer)}</style>
      <style>{altRepeatBadgeStyles(altRepeatRules, currentLayer)}</style>
      <motion.div
        className={`keyboard-editor h-[inherit] px-3 ${modeselect} ${modeselect === "color" ? "[&_.raiseKeyboard]:h-auto" : ""} singleViewMode ${
          typeof selectedPaletteColor === "number" ? "colorSelected" : ""
        }`}
        ref={layoutEditorContainerRef}
      >
        <PageHeader
          text="Layout Editor"
          showSaving
          isSaving={isSaving}
          contentSelector={
            <LayerSelector
              onSelect={selectLayer}
              itemList={layerMenu}
              selectedItem={currentLayer}
              subtitle={i18n.editor.layers.title}
              updateItem={onLayerNameChange}
              exportFunc={toExport}
              importFunc={toImport}
              clearFunc={confirmClear}
              copyFunc={copyFromDialog}
              editModeActual={modeselect}
              editModeFunc={modeSelectToggle}
              exportToPdf={exportToPdf}
            />
          }
          colorEditor={
            <ColorEditor
              colors={palette}
              disabled={isReadOnly || currentLayer > colorMap.length}
              onColorSelect={onColorSelect}
              colorButtonIsSelected={isColorButtonSelected}
              onColorPick={onColorPick}
              selected={selectedPaletteColor}
              isColorButtonSelected={isColorButtonSelected}
              onColorButtonSelect={onColorButtonSelect}
              toChangeAllKeysColor={toChangeAllKeysColor}
              applyColorMapChangeBL={applyColorMapChangeBL}
              applyColorMapChangeUG={applyColorMapChangeUG}
              deviceName={deviceName}
              deviceSides={state.currentDevice?.device?.sides || 2}
              hasUnderglow={
                (state.currentDevice?.device?.keyboardUnderglow?.ledsLeft?.length || 0) > 0 ||
                (state.currentDevice?.device?.keyboardUnderglow?.ledsRight?.length || 0) > 0
              }
            />
          }
          isColorActive={modeselect !== "keyboard"}
          saveContext={onApply}
          destroyContext={() => {
            log.info("cancelling context: ", props);
            scanned.current = false;
            cancelContext();
          }}
          inContext={modified}
          saveDisabled={altRepeatState === "failed" || holdModsState === "failed"}
          saveButtonRef={saveButtonRef}
          discardChangesButtonRef={discardChangesButtonRef}
        />
        <div className="w-full h-[inherit] keyboardsWrapper">
          {/* <div className="raise-editor layer-col h-full"> // Set keyboard on bottom */}
          <div className="raise-editor layer-col h-[inherit]">
            <div className="dygma-keyboard-editor editor">{layer}</div>
            {modeselect === "keyboard" ? (
              <div className="ordinary-keyboard-editor m-0 pb-4">
                {showAltRepeat && (
                  <AltRepeatTabs
                    state={altRepeatState}
                    rules={keyRules.map(index => altRepeatRules[index])}
                    selected={selectedRuleIdx === -1 ? -1 : altRepeatTab}
                    onSelect={setAltRepeatTab}
                    onAdd={() => setPreviousDialog({ open: true, ruleIndex: null })}
                    onChangePrevious={() => setPreviousDialog({ open: true, ruleIndex: selectedRuleIdx })}
                    onDelete={onDeleteRule}
                    onReload={onReloadAltRepeat}
                    allowRepeat={Boolean(store.get("capabilities.altRepeatKeyRepeat"))}
                    onToggleRepeat={onToggleRepeat}
                    totalCount={altRepeatRules.length}
                    block={defaultBlock}
                    replacesTap={replacesTap(defaultKeyCode, superkeys)}
                    noKeyDefault={defaultKeyCode === 0}
                    keymapDB={keymapDB}
                  />
                )}
                {selectedRule === null && (
                  <KeyPickerKeyboard
                    mouseWheel={mouseWheel}
                    resetScroll={resetScroll}
                    onKeySelect={onKeyChange}
                    code={code}
                    macros={macros}
                    superkeys={superkeys}
                    keyIndex={currentKeyIndex}
                    actTab="editor"
                    selectedlanguage={currentLanguageLayout}
                    isWireless={isWireless}
                    allowLayerHold={cellHoldProps.allowLayerHold}
                    keepHold={cellHoldProps.keepHold}
                    holdMods={cellHoldProps.holdMods}
                    multiAction={cellMultiAction()}
                  />
                )}
                {/* Offer the combo picker without Autoshift, since a rule output runs like a combo action. Layer hold needs v1.2.3 */}
                {selectedRule !== null && defaultBlock === null && (
                  <KeyPickerKeyboard
                    key={`ar-${currentLayer}-${currentKeyIndex}-${selectedRuleIdx}`}
                    mouseWheel={mouseWheel}
                    resetScroll={resetScroll}
                    onKeySelect={onRuleOutputChange}
                    code={keymapDB.keySegmentor(selectedRule.output)}
                    macros={macros}
                    superkeys={superkeys}
                    action={0}
                    keyIndex={currentKeyIndex}
                    actTab="combo"
                    selectedlanguage={currentLanguageLayout}
                    isWireless={isWireless}
                    allowAutoshift={false}
                    allowLayerHold={ruleHoldProps.allowLayerHold}
                    keepHold={ruleHoldProps.keepHold}
                    holdMods={ruleHoldProps.holdMods}
                    fullMouse
                  />
                )}
              </div>
            ) : (
              ""
            )}
          </div>
        </div>

        <ClearLayerDialog
          open={clearConfirmationOpen}
          onCancel={cancelClear}
          onConfirm={k => clearLayer(k.keyCode, k.colorIndex, k.chooseYourKeyboardSide)}
          colors={palette}
          selectedColorIndex={palette.length - 1}
          keyboardSide="BOTH"
          fillWithNoKey={false}
          deviceSides={state.currentDevice.device?.sides || 2}
        />

        <ComboBreakDialog
          open={comboBreak !== null}
          reason={comboBreak?.reason ?? null}
          comboIndexes={comboBreak?.comboIndexes ?? []}
          combos={combos}
          onUndo={undoComboBreak}
          onKeep={keepComboBreak}
        />

        <AltRepeatBreakDialog
          open={altRepeatBreak !== null}
          reason={altRepeatBreak?.reason ?? null}
          ruleCount={altRepeatBreak?.ruleCount ?? 0}
          onUndo={undoAltRepeatBreak}
          onKeep={() => setAltRepeatBreak(null)}
        />

        <PreviousKeyDialog
          open={previousDialog.open}
          initialCode={
            previousDialog.ruleIndex === null ? 0 : basePrevious(altRepeatRules[previousDialog.ruleIndex]?.previous ?? 0)
          }
          takenCodes={takenPreviousCodes}
          keymapDB={keymapDB}
          selectedlanguage={currentLanguageLayout}
          onConfirm={onConfirmPrevious}
          onCancel={() => setPreviousDialog({ open: false, ruleIndex: null })}
        />

        <CopyFromDialog
          open={copyFromOpen}
          onCopy={copyFromLayer}
          onCancel={cancelCopyFrom}
          layers={copyFromLayerOptions}
          currentLayer={currentLayer}
        />
      </motion.div>

      <Dialog open={showMacroModal} onOpenChange={toggleMacroModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.editor.oldMacroModal.title}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2 mt-2">
            <p>{i18n.editor.oldMacroModal.body}</p>
            <p className="italic">{i18n.editor.oldMacroModal.body2}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={toggleMacroModal}>
              {i18n.editor.oldMacroModal.cancelButton}
            </Button>
            <Button variant="secondary" size="sm" onClick={updateOldMacros}>
              {i18n.editor.oldMacroModal.cancelButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNeuronModal} onOpenChange={toggleNeuronModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{i18n.editor.oldNeuronModal.title}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-2 mt-2">
            <p>{i18n.editor.oldNeuronModal.body}</p>
            <p className="italic">{i18n.editor.oldNeuronModal.body2}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={toggleNeuronModal}>
              {i18n.editor.oldNeuronModal.cancelButton}
            </Button>
            <Button variant="secondary" size="sm" onClick={CloneExistingNeuron}>
              {i18n.editor.oldNeuronModal.applyButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Styles>
  );
};

export default LayoutEditor;
