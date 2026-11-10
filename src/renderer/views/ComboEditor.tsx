// -*- mode: js-jsx -*-
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Styled from "styled-components";

import { keyboardCanvasStyles } from "@Renderer/modules/KeyboardCanvas/keyboardCanvasStyles";
import log from "electron-log/renderer";
import { toast } from "react-toastify";

import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import Heading from "@Renderer/components/atoms/Heading";
import LogoLoader from "@Renderer/components/atoms/loader/LogoLoader";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import { IconClose, IconPlus } from "@Renderer/components/atoms/icons";
import Callout from "@Renderer/components/molecules/Callout/Callout";
import ListModifier from "@Renderer/components/molecules/ListModifiers/ListModifiers";
import KeyLabel from "@Renderer/components/molecules/KeyTags/KeyLabel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import { PageHeader } from "@Renderer/modules/PageHeader";
import { KeyPickerKeyboard } from "@Renderer/modules/KeyPickerKeyboard";
import SuperkeysSelector from "@Renderer/components/organisms/Select/SuperkeysSelector";
import MacrosMemoryUsage from "@Renderer/modules/Macros/MacrosMemoryUsage";
import { ComboBreakDialog } from "@Renderer/components/molecules/CustomModal/ComboBreakDialog";
import { AltRepeatBreakDialog } from "@Renderer/components/molecules/CustomModal/AltRepeatBreakDialog";
import { MultiActionProps, MultiActionStorage } from "@Renderer/modules/MultiAction/MultiActionTab";
import { actionText, labelContext, superkeyFace, withGeneratedNames } from "@Renderer/modules/MultiAction/multiActionLabel";
import { ComboSaveIO, refSlotsOf, runComboSave } from "@Renderer/modules/MultiAction/comboSave";
import { EMPTY_SUPERKEY_SAVED, SuperkeyMode, SuperkeySavedState } from "@Renderer/modules/HoldMods/layoutSave";
import { firstUnreadable, previewCommands } from "@Renderer/modules/DualFunctionKeys/previewReads";

import { useDevice } from "@Renderer/DeviceContext";
import Store from "@Renderer/utils/Store";
import getLanguage from "@Renderer/utils/language";
import { KeymapType, KeyType, PaletteType, SegmentedKeyType } from "@Renderer/types/layout";
import { Neuron } from "@Renderer/types/neurons";
import { MacrosType } from "@Renderer/types/macros";
import { SuperkeysType } from "@Renderer/types/superkeys";
import { AltRepeatBlock, AltRepeatRule, AltRepeatState } from "@Renderer/types/altRepeat";
import {
  COMBO_FLAG_ENABLED,
  COMBO_POSITION_UNUSED,
  ComboEditorProps,
  ComboType,
  MAX_COMBO_MEMBERS,
  MAX_COMBOS,
  MIN_COMBO_MEMBERS,
} from "@Renderer/types/combos";

import { KeymapDB } from "../../api/keymap";
import Backup from "../../api/backup";
import {
  ComboBreakReason,
  blockedComboPositions,
  comboMembers,
  duplicateComboIndex,
  emptyCombo,
  isLegacyCombosReply,
  overlappingComboIndexes,
  parseCombosRaw,
  parseCombosStrict,
  serializeCombos,
} from "../../api/parsers/combos";
import { parseColormapRaw, parseKeymapRaw, parseMacrosRaw, parsePaletteRaw } from "../../api/parsers";
import { decodeDualUse, readAltRepeatRules } from "../../api/parsers/altRepeat";
import { writeUncached } from "../../api/parsers/holdMods";
import {
  LayoutRefs,
  SkRef,
  SuperkeyDraft,
  applyMultiAction,
  cloneSuperkeyRefs,
  conflictMessage,
  defaultCellName,
  definedSlots,
  multiActionBreaks,
  protectedSlots,
  reconcileDraft,
  refName,
  superkeyRefs,
  superkeySlot,
  superkeyTapSeed,
  tapSeedRefused,
} from "../../api/parsers/multiAction";
import { transferUsed } from "../../api/parsers/layerTransfer";
import {
  MAX_ACTIVE_SUPERKEYS,
  SUPERKEY_FIRST,
  normalizeActions,
  parseSuperkeysTable,
  superkeyWriteFormat,
  writeSuperkeyTable,
} from "../../api/parsers/superkeys";

const store = Store.getStore();
const bkp = new Backup();

/* The very same rules the Layout Editor uses, so the board renders identically
 * in both views. The device SVGs emit bare class names and carry no styling of
 * their own, so without this block the keyboard comes out unstyled. */
const Styles = Styled.div`
  ${keyboardCanvasStyles}

  /* The Layout Editor gives the board the full width of the page; here it
   * shares the view with the slot row above it, so cap it. The min-width reset
   * overrides the shared fragment's 680px floor, which would otherwise force
   * horizontal scrolling on a narrow window. */
  .LayerHolder {
    min-width: 0;
    max-width: 1170px;
  }

  /* The theme colours of a focused key, for the generated rules that light
   * the selected combo's keys: that stylesheet is plain CSS and cannot reach
   * the theme itself. */
  --combo-key-border: ${({ theme }) => theme.styles.raiseKeyboard.keyOnFocusBorder};
  --combo-key-shadow: ${({ theme }) => theme.styles.raiseKeyboard.keyShadow};
`;

/* Fixed identities for the member slots. The slot count is a firmware
 * constant, so these are stable keys rather than array indexes. */
const SLOT_KEYS = ["slot-a", "slot-b", "slot-c", "slot-d", "slot-e", "slot-f"];
/** Which slot of the selected combo the keyboard below is currently feeding. */
type PickTarget = { kind: "member"; slot: number } | { kind: "action" } | null;

/* What Undo after a break warning puts back */
interface ComboSnapshot {
  superkeys: SuperkeysType[];
  combos: ComboType[];
}

type ComboBreakState = { reason: ComboBreakReason; comboIndexes: number[]; undo: ComboSnapshot };
type RuleBreakState = { reason: AltRepeatBlock; ruleCount: number; undo: ComboSnapshot };

const IDLE_ACTION = 1;

function ComboEditor(props: ComboEditorProps) {
  const { darkMode, startContext, cancelContext, setLoading, saveButtonRef, discardChangesButtonRef } = props;
  const { state } = useDevice();

  const [combos, setCombos] = useState<ComboType[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  /* How many slots the user has opened from the hover "+", including ones that
   * do not hold a key yet. Slots that hold a key are always shown. */
  const [openSlots, setOpenSlots] = useState(0);
  const [keymap, setKeymap] = useState<KeymapType>({ custom: [], default: [], onlyCustom: true });
  const [palette, setPalette] = useState<PaletteType[]>([]);
  /* One colormap per custom layer, so the board shows the colours of the
   * layer the selected combo lives on. */
  const [colormaps, setColormaps] = useState<number[][]>([]);
  const [layerNames, setLayerNames] = useState<string[]>([]);
  const [macros, setMacros] = useState<MacrosType[]>([]);
  /* Offer them as combo outputs, and tell complex superkeys, which cannot be a combo member, from the ones run as Qukeys, which can.
   * See comboBreakReason(). */
  const [superkeys, setSuperkeys] = useState<SuperkeysType[]>([]);
  /* "ready" once superkeys.map is read uncached and parsed */
  const [superkeysState, setSuperkeysState] = useState<SuperkeyMode>("unsupported");
  /* Rows at or above 70 from the load, kept to show what such a result held */
  const [superkeysBeyond, setSuperkeysBeyond] = useState<Map<number, number[]>>(new Map());
  /* False when the strict parser rejects the combos, since then not every Superkey reference is known */
  const [combosKnown, setCombosKnown] = useState(true);
  /* The previous-key rules, read only to know their Superkey references and the tabs an edit blocks */
  const [rules, setRules] = useState<AltRepeatRule[]>([]);
  const [rulesState, setRulesState] = useState<AltRepeatState>("unsupported");
  /* Remember what the keyboard holds, so Save writes only changes and an edit never reuses a slot the keyboard may play */
  const skSaved = useRef<SuperkeySavedState>(EMPTY_SUPERKEY_SAVED);
  /* The layout as the keyboard holds it, to tell clashes already on the keyboard from new ones */
  const skBaseline = useRef<SuperkeyDraft | null>(null);
  /* The serialized combos on the keyboard, null when unknown */
  const savedCombos = useRef<string | null>(null);
  const [comboBreak, setComboBreak] = useState<ComboBreakState | null>(null);
  const [ruleBreak, setRuleBreak] = useState<RuleBreakState | null>(null);
  /* Hold the rules warning until the combo warning closes */
  const [pendingRuleBreak, setPendingRuleBreak] = useState<RuleBreakState | null>(null);
  const [isWireless, setIsWireless] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [neuronID, setNeuronID] = useState("");
  const [modified, setModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [supported, setSupported] = useState(true);
  /* The first combos firmware: four keys per combo and combos on every layer.
   * Its blob has a different shape, so it is not edited at all. */
  const [legacyFirmware, setLegacyFirmware] = useState(false);

  const keymapDB = useMemo(() => new KeymapDB(), []);
  const currentLanguageLayout = getLanguage(store.get("settings.language") as string) || "en-US";

  /* ---------------------------------------------------------------------- */
  /* Load                                                                    */
  /* ---------------------------------------------------------------------- */

  const loadCombos = useCallback(async () => {
    const { currentDevice } = state;
    if (!currentDevice) return;

    try {
      setLoadingData(true);

      /* Read uncached, so the editor knows exactly what the keyboard holds before it allocates Superkey slots */
      const raw = (await currentDevice.noCacheCommand("combos.map")) as string;
      log.info("[Combos] combos.map ->", JSON.stringify(raw));

      if (typeof raw !== "string" || raw.trim().length === 0) {
        /* The command is unknown to this firmware. Say so rather than showing
         * an editor that silently cannot save. */
        log.warn("[Combos] empty reply: this firmware does not support combos.map");
        setSupported(false);
        setLoadingData(false);
        return;
      }

      if (isLegacyCombosReply(raw)) {
        log.warn("[Combos] combos.map has the 4-key format of an older firmware; not editing it");
        setLegacyFirmware(true);
        setSupported(false);
        setLoadingData(false);
        return;
      }

      setSupported(true);
      setLegacyFirmware(false);
      setDeviceName(currentDevice.device.info.product ?? "");
      setIsWireless(currentDevice.device.info.keyboardType === "wireless" || Boolean(currentDevice.device.wireless));

      /* Names live in the neuron store, keyed by chip id, exactly as superkey
       * names do -- the firmware blob has no room for them. */
      let chipID = (await currentDevice.command("hardware.chip_id")) as string;
      chipID = chipID.replace(/\s/g, "");
      setNeuronID(chipID);

      const neurons = (store.get("neurons") as Neuron[]) ?? [];
      const neuron = neurons.find(n => n.id === chipID);
      const loadedLayerNames = (neuron?.layers ?? []).map(layer => layer?.name ?? "");

      /* Edit the combos as before, and allocate Superkeys only with combos the strict parser accepts */
      const strict = parseCombosStrict(raw);
      setCombos(parseCombosRaw(raw, neuron?.combos ?? []));
      setCombosKnown(strict !== null);
      savedCombos.current = strict === null ? null : serializeCombos(strict);
      setLayerNames(loadedLayerNames);

      /* Macros, so the result picker can offer them. Names come from the
       * neuron store, as in the Macro Editor. */
      const macrosRaw = (await currentDevice.command("macros.map")) as string;
      const loadedMacros = macrosRaw ? parseMacrosRaw(macrosRaw, neuron?.macros ?? []) : [];
      setMacros(loadedMacros);

      let nextSuperkeysState: SuperkeyMode = "unsupported";
      let rawSuper: string | null = null;
      let skParsed: ReturnType<typeof parseSuperkeysTable> = null;

      if (store.get("capabilities.superkeys")) {
        const reply = await currentDevice.noCacheCommand("superkeys.map");
        skParsed = parseSuperkeysTable(reply);

        if (skParsed === null) {
          log.error("[Combos] superkeys.map could not be read", reply);
          nextSuperkeysState = "failed";
        } else {
          nextSuperkeysState = "ready";
          rawSuper = reply as string;
        }
      }

      const skTable = skParsed?.table ?? [];
      const loadCtx = labelContext(
        currentLanguageLayout,
        loadedLayerNames,
        loadedMacros.map(macro => macro.name ?? ""),
      );
      setSuperkeys(withGeneratedNames(skTable, loadCtx));
      setSuperkeysState(nextSuperkeysState);
      setSuperkeysBeyond(skParsed?.beyond ?? new Map());

      const keymapRaw = (await currentDevice.noCacheCommand("keymap.custom")) as string;
      const keymapDefault = (await currentDevice.noCacheCommand("keymap.default")) as string;
      const onlyCustom = Boolean(parseInt((await currentDevice.noCacheCommand("keymap.onlyCustom")) as string, 10));

      /* The board SVG wants parsed keys, not raw codes, so it can render each
       * label. Same shape the Layout Editor builds. */
      const layerSize = currentDevice.device.keyboard.rows * currentDevice.device.keyboard.columns;
      const customCodes: number[][] = parseKeymapRaw(keymapRaw, layerSize);
      const defaultCodes: number[][] = parseKeymapRaw(keymapDefault, layerSize);

      setKeymap({
        custom: customCodes.map(l => l.map((k: number) => keymapDB.parse(k))),
        default: defaultCodes.map(l => l.map((k: number) => keymapDB.parse(k))),
        onlyCustom,
      });

      /* The rules reference Superkeys too, and an edited Superkey can block the tabs of a key that uses it */
      let nextRules: AltRepeatRule[] = [];
      let nextRulesState: AltRepeatState = "unsupported";

      if (store.get("capabilities.altRepeat")) {
        const read = await readAltRepeatRules(currentDevice);
        nextRulesState = read === null ? "failed" : "ready";
        nextRules = read ?? [];

        if (read === null) {
          log.error("[Combos] altrepeat.map could not be read");
        }
      }

      setRules(nextRules);
      setRulesState(nextRulesState);

      const scanRefs: LayoutRefs = {
        customLayers: customCodes,
        defaultLayers: onlyCustom ? [] : defaultCodes,
        layerOffset: onlyCustom ? 0 : defaultCodes.length,
        rules: nextRules,
        combos: strict ?? [],
      };
      skSaved.current = {
        ...EMPTY_SUPERKEY_SAVED,
        table: rawSuper,
        storedRows: skParsed?.storedRows ?? null,
        keymapRefs: refSlotsOf({ ...scanRefs, rules: [], combos: [] }),
        ruleRefs: refSlotsOf({ rules: nextRules }),
        comboRefs: refSlotsOf({ combos: strict ?? [] }),
      };
      skBaseline.current = nextSuperkeysState === "ready" ? { ...scanRefs, table: skTable } : null;

      /* Colours, so the board reads exactly as it does in the Layout Editor.
       * The LED count has to be worked out the same way, or parseColormapRaw
       * chunks the blob into the wrong per-layer stride. */
      const keyboardLEDs = currentDevice.device.keyboard.ledsLeft.length + currentDevice.device.keyboard.ledsRight.length;
      const underglow = currentDevice.device.keyboardUnderglow;
      const underglowLEDs =
        (underglow.ledsLeft?.length ?? 0) + (underglow.ledsRight?.length ?? 0) || underglow.rows * underglow.columns;

      const paletteRaw = (await currentDevice.command("palette")) as string;
      const colormapRaw = (await currentDevice.command("colormap.map")) as string;

      const parsedPalette = parsePaletteRaw(paletteRaw, currentDevice.device.RGBWMode);
      const parsedColormap = parseColormapRaw(colormapRaw, keyboardLEDs + underglowLEDs);

      setPalette(parsedPalette);
      setColormaps(parsedColormap);
    } catch (error) {
      log.error("[Combos] failed to load", error);
      setSupported(false);
    } finally {
      setLoadingData(false);
      setLoading(false);
    }
  }, [state, setLoading, keymapDB, currentLanguageLayout]);

  useEffect(() => {
    loadCombos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Superkeys                                                               */
  /* ---------------------------------------------------------------------- */

  /* Label Superkeys from their actions, so key faces follow every edit */
  const labelCtx = useMemo(
    () =>
      labelContext(
        currentLanguageLayout,
        layerNames,
        macros.map(macro => macro.name ?? ""),
      ),
    [currentLanguageLayout, layerNames, macros],
  );

  const keymapCodes = useMemo(
    () => ({
      custom: keymap.custom.map(layer => layer.map(key => key.keyCode)),
      default: keymap.default.map(layer => layer.map(key => key.keyCode)),
    }),
    [keymap],
  );

  const layerOffset = keymap.onlyCustom ? 0 : keymap.default.length;

  /* Everything that can reference a Superkey, with these combos */
  const draftRefs = (list: ComboType[]): LayoutRefs => ({
    customLayers: keymapCodes.custom,
    defaultLayers: keymap.onlyCustom ? [] : keymapCodes.default,
    layerOffset,
    rules: rulesState === "ready" ? rules : [],
    combos: list,
  });

  const draftTable = (): number[][] =>
    superkeys.slice(0, MAX_ACTIVE_SUPERKEYS).map(superkey => normalizeActions(superkey.actions));

  /* Why Multi-action edits are off, or undefined. A new slot is safe only when every reference to the slots is known */
  const multiActionBlock = (): string | undefined => {
    if (superkeysState === "failed") {
      return i18n.editor.multiAction.unreadable;
    }

    if (superkeysState !== "ready") {
      return undefined;
    }

    if (!combosKnown) {
      return i18n.editor.multiAction.combosUnknown;
    }

    return rulesState === "failed" ? i18n.editor.multiAction.rulesUnknown : undefined;
  };

  /* The slots the keyboard holds a definition in. After a failed write it may hold the loaded table or the draft */
  const heldSlots = (): Set<number> => {
    const persisted = skSaved.current.table === null ? null : parseSuperkeysTable(skSaved.current.table);

    if (persisted !== null) {
      return new Set(definedSlots(persisted.table));
    }

    return new Set([...definedSlots(skBaseline.current?.table ?? []), ...definedSlots(draftTable())]);
  };

  /* The capacity meter counts slots the keyboard still holds as used, since a new Superkey never takes one */
  const superkeysInUse = (refs: Map<number, SkRef[]>): number =>
    new Set([...refs.keys(), ...protectedSlots(skSaved.current), ...heldSlots()].filter(s => s < MAX_ACTIVE_SUPERKEYS)).size;

  const showMultiActionToast = (content: string) => {
    toast.warn(<ToastMessage title={i18n.editor.multiAction.title} content={content} />, { autoClose: 4000 });
  };

  /* ---------------------------------------------------------------------- */
  /* Save                                                                    */
  /* ---------------------------------------------------------------------- */

  const storeNames = (list: ComboType[], table: number[][] | null) => {
    const neurons = (store.get("neurons") as Neuron[]) ?? [];
    const index = neurons.findIndex(n => n.id === neuronID);

    if (index < 0) {
      return;
    }

    neurons[index].combos = list;

    if (table !== null) {
      neurons[index].superkeys = withGeneratedNames(table, labelCtx);
    }

    store.set("neurons", neurons);
  };

  const onApply = async () => {
    const { currentDevice } = state;

    if (!currentDevice) {
      return;
    }

    /* Save Superkeys only when every reference to them is known. Every Multi-action edit is off otherwise, so the table is unchanged */
    const superkeysInput =
      superkeysState === "ready" && multiActionBlock() === undefined
        ? {
            format: superkeyWriteFormat(currentDevice.device.info.product),
            draft: { ...draftRefs(combos), table: draftTable() },
            saved: skSaved.current,
            baseline: skBaseline.current,
            onlyCustom: keymap.onlyCustom,
          }
        : undefined;

    const io: ComboSaveIO = {
      writeSuperkeys: (table, format, storedRows) => writeSuperkeyTable(currentDevice, table, format, storedRows),
      writeKeymap: async (serialized, onlyCustom) => {
        await writeUncached(currentDevice, "keymap.custom", serialized);
        await writeUncached(currentDevice, "keymap.onlyCustom", onlyCustom ? "1" : "0");
      },
      writeCombos: async serialized => {
        log.info(`[Combos] saving ${combos.length} combo(s)`);
        await writeUncached(currentDevice, "combos.map", serialized);
      },
      storeNames,
      /* Read the previews again uncached, so the backup records the keyboard's values and not a failed reply */
      rereadPreviews: async () => {
        const replies: { command: string; raw: unknown }[] = [];

        for (const command of previewCommands(Boolean(store.get("capabilities.quickTap")))) {
          // eslint-disable-next-line no-await-in-loop
          replies.push({ command, raw: await currentDevice.noCacheCommand(command) });
        }

        return firstUnreadable(replies);
      },
      /* Same as the other editors: a backup after every save. Lens reads the combos it badges from the newest backup */
      backup: async () => {
        const commands = await Backup.Commands(currentDevice);
        const backup = await bkp.DoBackup(commands, neuronID, currentDevice);
        Backup.SaveBackup(backup, currentDevice);
      },
    };

    try {
      setIsSaving(true);

      const outcome = await runComboSave(io, {
        combos,
        savedCombos: savedCombos.current,
        superkeys: superkeysInput,
        dualFunction: Boolean(store.get("capabilities.dualFunction")),
        isVirtual: currentDevice.file === true,
      });

      /* Refuse before any write, since the keyboard would play one of the clashing definitions on every key of a group */
      if (outcome.kind === "blocked") {
        const content = outcome.conflicts.map(conflict => conflictMessage(conflict, rules)).join(" ");
        toast.error(<ToastMessage title={i18n.editor.multiAction.conflictTitle} content={content} />, { autoClose: false });
        return;
      }

      /* Keep what the keyboard may hold also after a failed step, so a retry writes what is needed */
      savedCombos.current = outcome.savedCombos;

      if (outcome.superkeys) {
        skSaved.current = outcome.superkeys.saved;
      }

      if (outcome.warnings.length > 0) {
        const content = [i18n.editor.multiAction.conflictWarning]
          .concat(outcome.warnings.map(conflict => conflictMessage(conflict, rules)))
          .join(" ");
        toast.warn(<ToastMessage title={i18n.editor.multiAction.conflictTitle} content={content} />, { autoClose: 8000 });
      }

      if (outcome.kind === "failed") {
        log.error(`[Combos] save stopped at the ${outcome.failed} step`, outcome.error);
        throw outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));
      }

      if (outcome.superkeys) {
        const { table, layers } = outcome.superkeys;

        /* Show merged Superkeys as the keyboard now holds them */
        if (reconcileDraft(keymapCodes.custom, layers).length > 0) {
          setKeymap({
            default: keymap.default,
            onlyCustom: keymap.onlyCustom,
            custom: keymap.custom.map((layer, l) =>
              layer.map((key, i) => (layers[l][i] === key.keyCode ? key : keymapDB.parse(layers[l][i]))),
            ),
          });
        }

        setSuperkeys(withGeneratedNames(table, labelCtx));
        skBaseline.current = { ...draftRefs(combos), customLayers: layers, table };
      }

      if (outcome.backupSkipped !== undefined) {
        const content = i18n.editor.combos.backupSkipped.replace("{0}", outcome.backupSkipped);
        toast.warn(<ToastMessage title="Combos saved" content={content} />, { autoClose: 4000 });
      } else if (outcome.backupError !== undefined) {
        log.warn("[Combos] backup after save failed", outcome.backupError);
        toast.warn(<ToastMessage title="Combos saved" content={i18n.editor.combos.backupFailed} />, { autoClose: 4000 });
      } else {
        toast.success(<ToastMessage title="Combos saved" content="Your combos are now on the keyboard." />, { autoClose: 2000 });
      }

      setModified(false);
      cancelContext();
    } catch (error) {
      log.error("[Combos] failed to save", error);
      toast.error(<ToastMessage title="Could not save combos" content={String(error)} />, { autoClose: 4000 });
    } finally {
      setIsSaving(false);
    }
  };

  const destroyContext = async () => {
    setModified(false);
    cancelContext();
    await loadCombos();
  };

  /* ---------------------------------------------------------------------- */
  /* Editing                                                                 */
  /* ---------------------------------------------------------------------- */

  /* Combo ids double as list positions, so anything that reorders the list has
   * to renumber it. */
  const renumber = (list: ComboType[]): ComboType[] => list.map((item, index) => ({ ...item, id: index }));

  const commit = (list: ComboType[], nextSelected?: number) => {
    setCombos(list);
    if (nextSelected !== undefined) setSelected(nextSelected);
    setModified(true);
    startContext();
  };

  const updateCombo = (index: number, next: ComboType) => {
    const list = combos.slice();
    list[index] = next;
    commit(list);
  };

  const overLimit = () => {
    if (combos.length < MAX_COMBOS) return false;
    toast.warn(
      <ToastMessage title="No more combos" content={`This keyboard holds ${MAX_COMBOS} combos. Delete one to make room.`} />,
      { autoClose: 3000 },
    );
    return true;
  };

  const addCombo = (name?: string) => {
    if (overLimit()) return;
    /* A new combo starts on the layer the user is looking at. */
    const layer = combos[selected]?.layer ?? 0;
    const list = renumber(combos.concat([emptyCombo(combos.length, name || i18n.editor.combos.newCombo, layer)]));
    commit(list, list.length - 1);
    /* A new combo has no keys yet, so the first slot is armed straight away:
     * the next click on the board is its first key. */
    setPickTarget({ kind: "member", slot: 0 });
  };

  const cloneCombo = () => {
    if (overLimit()) return;
    const source = combos[selected];
    if (!source) return;

    /* Give a Superkey result its own copy, so the two combos never share one */
    let { action } = source;

    if (superkeySlot(action) !== null && superkeysState !== "unsupported") {
      const block = multiActionBlock();

      if (block !== undefined) {
        showMultiActionToast(block);
        return;
      }

      const table = draftTable();
      const cloned = cloneSuperkeyRefs([action], table, table, transferUsed(draftRefs(combos), skSaved.current, heldSlots()));

      if ("error" in cloned) {
        showMultiActionToast(i18n.editor.combos.cloneCapacity);
        return;
      }

      [action] = cloned.codes;

      if (cloned.missing.length > 0) {
        showMultiActionToast(i18n.editor.combos.cloneMissing);
      }

      if (cloned.table !== table) {
        setSuperkeys(withGeneratedNames(cloned.table, labelCtx));
      }
    }

    /* Everything is copied, keys included. The usual reason to clone is the
     * same chord on another layer: change the copy's layer and it is done.
     * Until then it duplicates the source, which the editor points out. */
    const copy: ComboType = {
      ...emptyCombo(combos.length, `Copy of ${source.name}`),
      positions: source.positions.slice(),
      layer: source.layer,
      flags: source.flags,
      action,
    };

    const list = renumber(combos.concat([copy]));
    commit(list, list.length - 1);
    setPickTarget(null);
  };

  const deleteCombo = (index: number) => {
    const list = renumber(combos.filter((_, i) => i !== index));
    commit(list, Math.max(0, Math.min(index, list.length - 1)));
    setPickTarget(null);
  };

  /* Empties the combo -- its keys and its result -- but keeps it where it is,
   * with its name and layer, and arms the first slot so the next click on the
   * board starts rebuilding it. Deleting the combo itself is the selector's
   * job, next to its name. */
  const clearCombo = () => {
    const current = combos[selected];
    if (!current) return;
    updateCombo(selected, {
      ...current,
      positions: new Array<number>(MAX_COMBO_MEMBERS).fill(COMBO_POSITION_UNUSED),
      action: 0,
    });
    setOpenSlots(0);
    setPickTarget({ kind: "member", slot: 0 });
  };

  const renameCombo = (name: string) => {
    const combo = combos[selected];
    if (!combo) return;
    updateCombo(selected, { ...combo, name });
  };

  const changeSelected = (id: number) => {
    setSelected(id < 0 ? 0 : id);
    setPickTarget(null);
  };

  /* Opened empty slots belong to the combo being edited, not to the next one. */
  useEffect(() => {
    setOpenSlots(0);
  }, [selected, combos.length]);

  const changeLayer = (layer: number) => {
    const combo = combos[selected];
    if (!combo || combo.layer === layer) return;
    updateCombo(selected, { ...combo, layer });
  };

  /* A key may belong to any number of combos, so nothing is greyed out for
   * being used elsewhere. The firmware resolves overlaps itself: while a longer
   * combo can still complete it waits, so pressing every key of the longer one
   * fires the longer one. The one conflict it cannot resolve is the same keys
   * on the same layer twice -- the first listed always wins -- and that is
   * pointed out below the slots instead of being prevented. */
  const duplicateOf = useMemo(() => duplicateComboIndex(combos, selected), [combos, selected]);
  const overlapsWith = useMemo(() => overlappingComboIndexes(combos, selected), [combos, selected]);

  /* Two slots always, more once opened or filled, up to the firmware's six. A
   * combo read back from the keyboard with a key in a later slot keeps it
   * visible, so nothing the firmware holds is ever hidden from the user. */
  const visibleSlots = useMemo(() => {
    const positions = combos[selected]?.positions ?? [];
    let lastUsed = -1;
    positions.forEach((position, slot) => {
      if (position !== COMBO_POSITION_UNUSED) lastUsed = slot;
    });
    return Math.min(MAX_COMBO_MEMBERS, Math.max(MIN_COMBO_MEMBERS, lastUsed + 1, openSlots));
  }, [combos, selected, openSlots]);

  const addSlot = () => {
    setOpenSlots(visibleSlots + 1);
    setPickTarget({ kind: "member", slot: visibleSlots });
  };

  /* Drops the slot entirely rather than just emptying it, shifting any later
   * keys up so the combo never ends up with a gap. */
  const removeSlot = (slot: number) => {
    const combo = combos[selected];
    if (!combo) return;
    const positions = combo.positions.filter((_, i) => i !== slot).concat([COMBO_POSITION_UNUSED]);
    updateCombo(selected, { ...combo, positions });
    setOpenSlots(Math.max(0, visibleSlots - 1));
    if (pickTarget?.kind === "member" && pickTarget.slot >= slot) setPickTarget(null);
  };

  const onActionKeySelect = (keyCode: number) => {
    const combo = combos[selected];
    if (!combo) return;

    // Ignore a picker tab re-sending the current output, so opening the picker doesn't mark the combo modified
    if (keyCode === combo.action) {
      return;
    }

    log.info(`[Combos] combo ${selected} action -> ${keyCode}`);
    updateCombo(selected, { ...combo, action: keyCode, flags: combo.flags || COMBO_FLAG_ENABLED });
  };

  /* Show one warning at a time. The combo warning goes first */
  const showBreaks = (
    comboReason: ComboBreakReason | null,
    comboIndexes: number[],
    ruleReason: AltRepeatBlock | null,
    ruleCount: number,
    undo: ComboSnapshot,
  ) => {
    const rulesBreak =
      rulesState === "ready" && ruleReason !== null && ruleCount > 0 ? { reason: ruleReason, ruleCount, undo } : null;

    if (comboReason && comboIndexes.length > 0) {
      setComboBreak({ reason: comboReason, comboIndexes, undo });
      setPendingRuleBreak(rulesBreak);
    } else if (rulesBreak) {
      setRuleBreak(rulesBreak);
    }
  };

  const restoreSnapshot = (snapshot: ComboSnapshot) => {
    setSuperkeys(snapshot.superkeys);
    setCombos(snapshot.combos);
    setModified(true);
    startContext();
  };

  const undoComboBreak = () => {
    if (comboBreak) {
      restoreSnapshot(comboBreak.undo);
    }

    setComboBreak(null);
    setPendingRuleBreak(null);
  };

  const keepComboBreak = () => {
    setComboBreak(null);
    setRuleBreak(pendingRuleBreak);
    setPendingRuleBreak(null);
  };

  const undoRuleBreak = () => {
    if (ruleBreak) {
      restoreSnapshot(ruleBreak.undo);
    }

    setRuleBreak(null);
  };

  /* Set the five actions of the selected combo's result, as a plain key or a Superkey */
  const onComboMultiActionChange = (actions: number[]) => {
    const current = combos[selected];

    if (!current || superkeysState !== "ready" || multiActionBlock() !== undefined) {
      return;
    }

    const table = draftTable();
    const result = applyMultiAction(
      {
        table,
        refs: superkeyRefs(draftRefs(combos)),
        protectedSlots: protectedSlots(skSaved.current),
        currentCode: current.action,
        heldSlots: heldSlots(),
      },
      { kind: "combo", index: selected },
      actions,
    );

    if ("error" in result) {
      showMultiActionToast(result.error === "capacity" ? i18n.editor.multiAction.capacity : i18n.editor.multiAction.emptyRule);
      return;
    }

    const { table: nextTable, code: nextCode } = result;

    if (nextCode === current.action && nextTable === table) {
      return;
    }

    const undo: ComboSnapshot = { superkeys, combos };
    const list =
      nextCode === current.action
        ? combos
        : combos.map((each, index) =>
            index === selected ? { ...each, action: nextCode, flags: each.flags || COMBO_FLAG_ENABLED } : each,
          );

    /* Check every key that uses an edited Superkey, on the custom and the default layers */
    const ruleList = rulesState === "ready" ? rules : [];
    const custom = multiActionBreaks(
      { customLayers: keymapCodes.custom, table, layerOffset },
      { customLayers: keymapCodes.custom, table: nextTable, layerOffset },
      list,
      ruleList,
    );
    const defaults = keymap.onlyCustom
      ? null
      : multiActionBreaks(
          { customLayers: keymapCodes.default, table, layerOffset: 0 },
          { customLayers: keymapCodes.default, table: nextTable, layerOffset: 0 },
          list,
          ruleList,
        );
    const comboIndexes = [...new Set([...custom.comboIndexes, ...(defaults?.comboIndexes ?? [])])].sort((a, b) => a - b);

    if (nextTable !== table) {
      setSuperkeys(withGeneratedNames(nextTable, labelCtx));
    }

    log.info(`[Combos] combo ${selected} multi-action -> ${nextCode}`);
    commit(list);
    showBreaks(
      custom.comboReason ?? defaults?.comboReason ?? null,
      comboIndexes,
      custom.ruleReason ?? defaults?.ruleReason ?? null,
      custom.ruleCount + (defaults?.ruleCount ?? 0),
      undo,
    );
  };

  /* The Multi-action tab for the selected combo's result. Keyboards without Superkeys have none, since a result can't be dual-function */
  const comboMultiAction = (): MultiActionProps | undefined => {
    const current = combos[selected];

    if (!current || superkeysState === "unsupported") {
      return undefined;
    }

    const code = current.action;
    const table = draftTable();
    const refs = superkeyRefs(draftRefs(combos));
    const slot = superkeySlot(code);
    const dualUse = decodeDualUse(code);
    const tapSeed = superkeyTapSeed(code);
    let actions = normalizeActions([tapSeed ?? IDLE_ACTION]);
    let storage: MultiActionStorage = "plain";
    let notice: string | undefined = tapSeedRefused(code) ? i18n.editor.multiAction.tapNotSeeded : undefined;

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

    const ruleList = rulesState === "ready" ? rules : [];
    const users = slot === null ? [] : (refs.get(slot) ?? []).map(ref => refName(ref, ruleList, defaultCellName));

    return {
      mode: "full",
      context: "combo",
      actions,
      storage,
      slot: slot !== null && slot < MAX_ACTIVE_SUPERKEYS ? slot : null,
      users,
      capacity: { used: superkeysInUse(refs), max: MAX_ACTIVE_SUPERKEYS },
      disabledReason: multiActionBlock(),
      notice,
      actionLabel: action => actionText(action, labelCtx),
      onChange: onComboMultiActionChange,
    };
  };

  /* ---------------------------------------------------------------------- */
  /* Render helpers                                                          */
  /* ---------------------------------------------------------------------- */

  /* Layers are numbered the way the firmware numbers them, which is also how
   * the Layout Editor does: the default layers first unless only custom
   * layers are in use. Only custom layers are offered, as in the Layout
   * Editor's layer list. */
  const customOffset = keymap.onlyCustom ? 0 : keymap.default.length;

  const layerLabel = useCallback((layer: number) => `${layer + 1}: ${layerNames[layer] || `L${layer + 1}`}`, [layerNames]);

  const layerOptions = useMemo(() => {
    const options = keymap.custom.map((_, index) => index + customOffset);
    /* Never hide what the keyboard holds: a combo stored on a layer that is
     * not in the list still shows its own layer. */
    const current = combos[selected]?.layer;
    if (current !== undefined && !options.includes(current)) options.push(current);
    return options;
  }, [keymap, customOffset, combos, selected]);

  const comboLayer = combos[selected]?.layer ?? customOffset;

  /* Macro and superkey keys read as their names, as in the Layout Editor:
   * the first five characters of the name in place of the bare number. */
  const withName = useCallback(
    (key: KeyType): KeyType => {
      /* Label Superkeys from their actions, as the Layout Editor does */
      if (key?.extraLabel === "SUPER") {
        const slot = key.keyCode - SUPERKEY_FIRST;
        return { ...key, label: superkeyFace(superkeys[slot]?.actions, slot, labelCtx) };
      }

      if (!key || typeof key.label !== "string" || /\p{L}/u.test(key.label)) return key;
      const name = key.extraLabel === "MACRO" ? macros[key.keyCode - 53852]?.name : undefined;
      return name ? { ...key, label: name.substring(0, 5) } : key;
    },
    [macros, superkeys, labelCtx],
  );

  const layerData = useMemo((): KeyType[] => {
    let layer: KeyType[];
    if (keymap.onlyCustom) layer = keymap.custom[comboLayer] ?? keymap.custom[0] ?? [];
    else if (comboLayer < keymap.default.length) layer = keymap.default[comboLayer] ?? [];
    else layer = keymap.custom[comboLayer - keymap.default.length] ?? keymap.custom[0] ?? keymap.default[0] ?? [];
    return layer.map(withName);
  }, [keymap, comboLayer, withName]);

  const colormap = colormaps[comboLayer - customOffset] ?? colormaps[0] ?? [];

  /* Keys of this layer holding a Layer Lens key or a complex superkey can't be a combo member, so the board doesn't offer them while
   * a slot is being picked. Superkeys that run as Qukeys (TAP + a modifier or layer on HOLD) stay selectable. */
  const blockedPositions = useMemo(
    () =>
      blockedComboPositions(
        layerData.map(key => key?.keyCode),
        superkeys,
      ),
    [layerData, superkeys],
  );

  const onKeyboardKeySelect = (event: React.MouseEvent<Element>) => {
    if (!pickTarget || pickTarget.kind !== "member") return;

    const { currentTarget } = event;
    const keyIndex = parseInt(currentTarget.getAttribute("data-key-index"), 10);
    if (Number.isNaN(keyIndex)) return;

    const current = combos[selected];
    if (!current) return;

    const positions = current.positions.slice();

    /* The same key twice in one combo would never be satisfiable. */
    if (positions.includes(keyIndex)) return;
    /* The board already takes no clicks on these; this covers anything that
     * gets past the styling. */
    if (blockedPositions.has(keyIndex)) return;

    positions[pickTarget.slot] = keyIndex;
    updateCombo(selected, { ...current, positions });

    /* Advance to the next slot instead of clearing the selection: a combo is
     * several keys, and picking them is one continuous gesture. Stops at the
     * last slot rather than wrapping, so a two-key combo does not quietly
     * re-arm the slot the user just filled. */
    const nextSlot = pickTarget.slot + 1;
    setPickTarget(nextSlot < visibleSlots ? { kind: "member", slot: nextSlot } : null);
  };

  const labelForPosition = (position: number) => {
    if (position === COMBO_POSITION_UNUSED || !layerData[position]) {
      return null;
    }

    return <KeyLabel keyData={layerData[position]} />;
  };

  const actionLabel = (item: ComboType) => {
    if (!item || !item.action) {
      return null;
    }

    return <KeyLabel keyData={withName(keymapDB.parse(item.action))} />;
  };

  const combo = combos[selected];
  const memberCount = combo ? comboMembers(combo).length : 0;
  const incomplete = combo && (memberCount < MIN_COMBO_MEMBERS || !combo.action);

  /* The selected combo's keys are lit on the board, done with CSS keyed on
   * data-key-index, which the shared api/hardware/Key component puts on every
   * key of every board. That keeps this working across all eight device SVGs
   * without touching any of them. A lit key looks exactly like the selected
   * key of the Layout Editor: these are the shared `keyOnFocus` rules,
   * repeated per key because the boards only set that class on the one key
   * their `selectedKey` names.
   *
   * Three levels of brightness. The combo's own keys are always at full
   * strength. While a slot is being picked the rest of the board sits at
   * 70%, bright enough to read as clickable, and the key under the pointer
   * comes up to full; the combo's own keys stop taking clicks, as the same
   * key twice in one combo could never be satisfied. While nothing is being
   * picked the rest of the board drops to 40%, so the combo reads at a
   * glance. Keys used by other combos stay available.
   *
   * The selectors lead with `.comboEditor` so they outrank the shared
   * keyOnFocus rules, and the dimming rules come first so the member rules,
   * of equal weight, override them. */
  const highlightStyles = useMemo(() => {
    const own = combos[selected] ? comboMembers(combos[selected]) : [];
    const picking = pickTarget?.kind === "member";
    const rules = [
      `.comboEditor .comboKeyboard .keyItem, .comboEditor .comboKeyboard #neuronWrapper { transition: opacity 150ms ease-in-out; }`,
      `.comboEditor .comboKeyboard.comboPicking .keyItem, .comboEditor .comboKeyboard.comboPicking #neuronWrapper { opacity: 0.7; }`,
      `.comboEditor .comboKeyboard.comboPicking .keyItem:hover { opacity: 1; }`,
      `.comboEditor .comboKeyboard.comboIdle .keyItem, .comboEditor .comboKeyboard.comboIdle #neuronWrapper { opacity: 0.4; }`,
    ];
    /* Grey out blocked keys and make them unclickable while picking. Add these rules before the member rules, so a combo that
     * already holds one (saved before this check existed) still shows that key lit. */
    if (picking) {
      blockedPositions.forEach(position => {
        rules.push(
          `.comboEditor .comboKeyboard.comboPicking .keyItem[data-key-index="${position}"] { opacity: 0.15; pointer-events: none; }`,
        );
      });
    }
    own.forEach(position => {
      const key = `.comboEditor .comboKeyboard .keyItem[data-key-index="${position}"]`;
      rules.push(
        `${key} { opacity: 1;${picking ? " pointer-events: none;" : ""} }`,
        `${key} .baseShape { filter: drop-shadow(0px 4px 0px var(--combo-key-shadow)); }`,
        `${key} .keyOpacityInternal { stroke-opacity: 0.7; stroke: var(--combo-key-border); }`,
        `${key} .keyOpacity { stroke-opacity: 0.2; stroke: var(--combo-key-border); }`,
        `${key} .shadowHover { filter: blur(16px); opacity: 0.6; }`,
      );
    });
    return rules.join("\n");
  }, [pickTarget, combos, selected, blockedPositions]);

  const KeyboardComponent = state.currentDevice?.device?.components?.keymap as React.FC<any> | undefined;

  if (loadingData) return <LogoLoader centered />;

  if (!supported) {
    return (
      <div className="px-3">
        <PageHeader text="Combo Editor" contentSelector={false} showSaving={false} />
        <Callout size="sm" className="mt-4">
          {legacyFirmware ? (
            <p>
              This keyboard runs an early version of combos, with up to four keys and combos shared by every layer. Update the
              firmware to edit combos with up to six keys, one layer each.
            </p>
          ) : (
            <p>
              This keyboard&apos;s firmware does not support combos yet. Update the firmware to a build that includes the Combos
              plugin and reconnect.
            </p>
          )}
        </Callout>
      </div>
    );
  }

  /* Deliberately NOT carrying the Layout Editor's `keyboard singleViewMode`
   * classes. Those pin the board to `height: 100%`, which only resolves
   * because that view gives its container an explicit height; here the board
   * sits in normal flow and would collapse. `.LayerHolder` plus
   * `.raiseKeyboard` are what centre it and let the SVG fill the width. */
  return (
    <Styles className="comboEditor px-3">
      <style>{highlightStyles}</style>

      <PageHeader
        text="Combo Editor"
        showSaving
        contentSelector={
          <>
            <SuperkeysSelector
              itemList={combos}
              selectedItem={selected}
              subtitle="Combos"
              itemLabel="combo"
              createTitle={i18n.editor.combos.createModal.createNew}
              renameTitle={i18n.editor.combos.createModal.rename}
              inputLabel={i18n.editor.combos.createModal.inputLabel}
              onSelect={changeSelected}
              addItem={addCombo}
              deleteItem={() => deleteCombo(selected)}
              updateItem={renameCombo}
              cloneItem={cloneCombo}
              checkLimit={overLimit}
            />
            {/* warningOffset defaults to 20, which is sized for the macro buffer;
             * against 32 combo slots that would raise the "out of space"
             * error at 12. */}
            <MacrosMemoryUsage context="combos" mem={combos.length} tMem={MAX_COMBOS} warningOffset={2} />
          </>
        }
        saveContext={onApply}
        destroyContext={destroyContext}
        inContext={modified}
        isSaving={isSaving}
        saveButtonRef={saveButtonRef}
        discardChangesButtonRef={discardChangesButtonRef}
      />

      <Callout size="sm" className="mt-4">
        <p>
          Combos let you press up to 6 keys at once to trigger a single action. Keys can be shared between combos, and you can have different combos in different layers.
        </p>
        <p>
          To create a combo, select the layer, choose the keys and configure the output.
        </p>
      </Callout>

      {/* ---------------------------------------------------------------- */}
      {/* [k1] + [k2] + ... = [action]                                      */}
      {/* ---------------------------------------------------------------- */}
      {combo ? (
        <div className="mt-6 rounded-regular bg-gray-25/50 dark:bg-gray-400/15 p-4">
          {/* Equal side columns keep the slot row centred whatever the Clear
           * button on the right measures. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="justify-self-start">
              <Heading headingLevel={4} renderAs="paragraph-sm" className="mb-1">
                Layer
              </Heading>
              <Select value={String(comboLayer)} onValueChange={value => changeLayer(parseInt(value, 10))}>
                <SelectTrigger className="min-w-40">
                  <SelectValue placeholder="Layer" />
                </SelectTrigger>
                <SelectContent>
                  {layerOptions.map(layer => (
                    <SelectItem value={String(layer)} key={`combo-layer-${layer}`}>
                      {layerLabel(layer)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              {combo.positions.slice(0, visibleSlots).map((position, slot) => (
                <React.Fragment key={SLOT_KEYS[slot]}>
                  {slot > 0 && <span className="text-lg text-gray-400 dark:text-gray-300">+</span>}
                  <span className="relative">
                    <Button
                      variant="config"
                      size="sm"
                      selected={pickTarget?.kind === "member" && pickTarget.slot === slot}
                      className="min-w-20 h-12 text-ssm"
                      onClick={() => setPickTarget({ kind: "member", slot })}
                    >
                      {position === COMBO_POSITION_UNUSED ? <IconPlus size="xs" /> : labelForPosition(position)}
                    </Button>
                    {/* The first two slots are the minimum a combo needs, so
                     * only the ones after them can be dropped. */}
                    {slot >= MIN_COMBO_MEMBERS && (
                      <button
                        type="button"
                        title="Remove this key"
                        aria-label="Remove this key"
                        className="absolute -top-2 -right-2 z-10 flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-600 hover:bg-primary hover:text-white dark:bg-gray-500 dark:text-gray-25 dark:hover:bg-primary transition-colors"
                        onClick={() => removeSlot(slot)}
                      >
                        <IconClose />
                      </button>
                    )}
                  </span>
                </React.Fragment>
              ))}

              {/* The add button sits beside the last slot, in the flow, so it
               * never shares a corner with that slot's remove button. */}
              {visibleSlots < MAX_COMBO_MEMBERS && (
                <button
                  type="button"
                  title="Add another key"
                  aria-label="Add another key"
                  className="flex items-center justify-center w-8 h-8 rounded-full border border-dashed border-gray-300 text-gray-400 hover:border-purple-200 hover:bg-purple-200 hover:text-white dark:border-gray-400 dark:text-gray-200 dark:hover:border-purple-200 dark:hover:bg-purple-200 transition-colors"
                  onClick={addSlot}
                >
                  <IconPlus size="xs" />
                </button>
              )}

              <span className="text-lg text-gray-400 dark:text-gray-300">=</span>

              <Button
                variant="config"
                size="sm"
                selected={pickTarget?.kind === "action"}
                className="min-w-24 h-12 text-ssm"
                onClick={() => setPickTarget({ kind: "action" })}
              >
                {combo.action ? (
                  /* The modifiers ride along as the same badges the Layout
                   * Editor shows, as the label alone ("A") hides them. */
                  <span className="flex flex-col items-center gap-0.5">
                    {actionLabel(combo)}
                    <ListModifier keyCode={combo.action} size="xs" />
                  </span>
                ) : (
                  <IconPlus size="xs" />
                )}
              </Button>
            </div>

            {/* Right after the result rather than at the far edge, so it reads
             * as part of the combo it clears. */}
            <div className="justify-self-start ml-6">
              <Button variant="config" size="sm" className="gap-2" onClick={clearCombo}>
                <IconClose /> Clear
              </Button>
            </div>
          </div>

          {duplicateOf >= 0 && (
            <div className="mt-3 text-center text-ssm font-semibold text-orange-200">
              C{duplicateOf + 1}
              {combos[duplicateOf]?.name ? ` · ${combos[duplicateOf].name}` : ""} uses exactly these keys on this layer. Only the
              one listed first can fire: change the keys or the layer of one of them.
            </div>
          )}

          {incomplete && (
            <div className="mt-3 text-center text-ssm text-gray-400 dark:text-gray-300">
              A combo needs at least {MIN_COMBO_MEMBERS} keys and a resulting key before it does anything.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 text-center text-ssm text-gray-400 dark:text-gray-300">No combos yet. Add one to get started.</div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The keyboard, in one of its two roles                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6">
        {pickTarget?.kind === "action" ? (
          <>
            <Heading headingLevel={4} renderAs="paragraph-sm" className="mb-2 text-center">
              Choose the output for the combo
            </Heading>
            <KeyPickerKeyboard
              onKeySelect={onActionKeySelect}
              code={keymapDB.keySegmentor(combo?.action ?? 0) as SegmentedKeyType}
              macros={macros}
              superkeys={superkeys}
              action={0}
              actTab="combo"
              selectedlanguage={currentLanguageLayout}
              keyIndex={0}
              isWireless={isWireless}
              mouseWheel={0}
              resetScroll={() => {}}
              allowAutoshift={false}
              fullMouse
              multiAction={comboMultiAction()}
            />
          </>
        ) : (
          <>
            <Heading headingLevel={4} renderAs="paragraph-sm" className="mb-2 text-center">
              {pickTarget?.kind === "member"
                ? "Pick a key"
                : "Select a slot above, then assign a key"}
            </Heading>
            <p className="mb-2 text-center text-ssm text-gray-400 dark:text-gray-300">
              Note: Layer Lens keys and Swap hands keys can&apos;t be part of a combo, and neither can Superkeys unless configured only
              with TAP and a modifier or layer on HOLD.
            </p>
            {KeyboardComponent && layerData.length > 0 ? (
              <div
                className={`comboKeyboard LayerHolder ${pickTarget?.kind === "member" ? "comboPicking" : "comboIdle pointer-events-none"}`}
              >
                <KeyboardComponent
                  readOnly={false}
                  index={0}
                  keymap={layerData}
                  onKeySelect={onKeyboardKeySelect}
                  selectedKey={-1}
                  selectedLED={-1}
                  palette={palette}
                  colormap={colormap}
                  darkMode={darkMode}
                  style={{ width: "100%" }}
                  showUnderglow={false}
                  className={`svg-${deviceName.toLowerCase()} raiseKeyboard layer h-auto`}
                  isStandardView={false}
                />
              </div>
            ) : null}
          </>
        )}
      </div>

      <ComboBreakDialog
        open={comboBreak !== null}
        reason={comboBreak?.reason ?? null}
        comboIndexes={comboBreak?.comboIndexes ?? []}
        combos={combos}
        onUndo={undoComboBreak}
        onKeep={keepComboBreak}
      />

      <AltRepeatBreakDialog
        open={ruleBreak !== null}
        reason={ruleBreak?.reason ?? null}
        ruleCount={ruleBreak?.ruleCount ?? 0}
        onUndo={undoRuleBreak}
        onKeep={() => setRuleBreak(null)}
      />
    </Styles>
  );
}

export default ComboEditor;
