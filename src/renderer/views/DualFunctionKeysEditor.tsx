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
import log from "electron-log/renderer";
import { toast } from "react-toastify";

import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import Heading from "@Renderer/components/atoms/Heading";
import LogoLoader from "@Renderer/components/atoms/loader/LogoLoader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import Callout from "@Renderer/components/molecules/Callout/Callout";
import { PageHeader } from "@Renderer/modules/PageHeader";
import { keyboardCanvasStyles } from "@Renderer/modules/KeyboardCanvas/keyboardCanvasStyles";
import { backupAfterSave } from "@Renderer/modules/KeyOverrides/backupAfterSave";
import OverridePanel from "@Renderer/modules/DualFunctionKeys/OverridePanel";
import { dualFunctionBadgeBaseStyles, dualFunctionBadgeStyles } from "@Renderer/modules/DualFunctionKeys/dualFunctionBadges";
import {
  OverridePatch,
  clearOverride,
  keyRole,
  overrideAt,
  updateOverride,
} from "@Renderer/modules/DualFunctionKeys/overrideTable";
import { useDevice } from "@Renderer/DeviceContext";
import Store from "@Renderer/utils/Store";
import { DualFunctionGlobalPreview, DualFunctionKeysEditorProps, DualFunctionKeysState } from "@Renderer/types/dualFunctionKeys";
import { KeymapType, KeyType, PaletteType } from "@Renderer/types/layout";
import { MacrosType } from "@Renderer/types/macros";
import { Neuron } from "@Renderer/types/neurons";
import { SuperkeysType } from "@Renderer/types/superkeys";

import { KeymapDB } from "../../api/keymap";
import Backup from "../../api/backup";
import Device from "../../api/comms/Device";
import { parseColormapRaw, parseKeymapRaw, parseMacrosRaw, parsePaletteRaw, parseSuperkeysRaw } from "../../api/parsers";
import { readQuickTapTerm } from "../../api/parsers/quickTap";
import { MACRO_FIRST, SUPERKEY_FIRST } from "../../api/parsers/altRepeat";
import {
  PerKeyOverride,
  VALID_POSITIONS,
  readDualFunctionGlobals,
  readPerKeyOverrides,
  serializePerKeyOverrides,
  validatePerKeyOverrides,
  writePerKeyOverrides,
} from "../../api/parsers/dualFunction";

const store = Store.getStore();
const bkp = new Backup();

const SCOPE = ".dualFunctionKeysEditor";
const NO_GLOBALS: DualFunctionGlobalPreview = { holdTimeout: null, quickTapTerm: null, priorInterval: null, options: null };

/* Share the Layout Editor's board rules, since the device SVGs carry no styling of their own. Lift the 680px floor and cap the width as
 * the Combo Editor does */
const Styles = Styled.div`
  ${keyboardCanvasStyles}

  .LayerHolder {
    min-width: 0;
    max-width: 1170px;
  }
`;

const parseNumber = (raw: unknown): number | null => {
  if (typeof raw !== "string" || !/^\s*\d+\s*$/.test(raw)) {
    return null;
  }

  return parseInt(raw, 10);
};

function DualFunctionKeysEditor(props: DualFunctionKeysEditorProps) {
  const { darkMode, startContext, cancelContext, setLoading, saveButtonRef, discardChangesButtonRef } = props;
  const { state } = useDevice();
  const strings = i18n.editor.dualFunctionKeys;

  const [list, setList] = useState<PerKeyOverride[]>([]);
  const [globals, setGlobals] = useState<DualFunctionGlobalPreview>(NO_GLOBALS);
  const [loadState, setLoadState] = useState<DualFunctionKeysState>("unsupported");
  const [loadingData, setLoadingData] = useState(true);
  const [modified, setModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [shownLayer, setShownLayer] = useState(0);
  const [keymap, setKeymap] = useState<KeymapType>({ custom: [], default: [], onlyCustom: true });
  const [palette, setPalette] = useState<PaletteType[]>([]);
  const [colormaps, setColormaps] = useState<number[][]>([]);
  const [layerNames, setLayerNames] = useState<string[]>([]);
  const [macros, setMacros] = useState<MacrosType[]>([]);
  const [superkeys, setSuperkeys] = useState<SuperkeysType[]>([]);
  const [deviceName, setDeviceName] = useState("");
  /* The list as the last edit left it, so a save can tell whether anything changed while it ran */
  const listRef = useRef<PerKeyOverride[]>([]);

  const keymapDB = useMemo(() => new KeymapDB(), []);
  const locked = isSaving || loadState !== "ready";

  /* ---------------------------------------------------------------------- */
  /* Load                                                                    */
  /* ---------------------------------------------------------------------- */

  const replaceAll = useCallback((next: PerKeyOverride[]) => {
    setList(next);
    listRef.current = next;
  }, []);

  const loadKeyboardView = useCallback(
    async (currentDevice: Device) => {
      const chipID = await currentDevice.command("hardware.chip_id");
      const neuronID = typeof chipID === "string" ? chipID.replace(/\s/g, "") : "";
      const neurons = (store.get("neurons") as Neuron[]) ?? [];
      const neuron = neurons.find(n => n.id === neuronID);
      setLayerNames((neuron?.layers ?? []).map(layer => layer?.name ?? ""));

      const macrosRaw = (await currentDevice.command("macros.map")) as string;
      setMacros(macrosRaw ? parseMacrosRaw(macrosRaw, neuron?.macros ?? []) : []);

      const superkeysRaw = (await currentDevice.command("superkeys.map")) as string;
      setSuperkeys(superkeysRaw ? parseSuperkeysRaw(superkeysRaw, neuron?.superkeys ?? []) : []);

      /* rows * columns is 60 on the Sonsei, so positions 56..59 get labels too */
      const layerSize = currentDevice.device.keyboard.rows * currentDevice.device.keyboard.columns;
      const keymapRaw = (await currentDevice.command("keymap.custom")) as string;
      const keymapDefault = (await currentDevice.command("keymap.default")) as string;
      const onlyCustom = Boolean(parseInt((await currentDevice.command("keymap.onlyCustom")) as string, 10));

      setKeymap({
        custom: parseKeymapRaw(keymapRaw, layerSize).map(l => l.map((k: number) => keymapDB.parse(k))),
        default: parseKeymapRaw(keymapDefault, layerSize).map(l => l.map((k: number) => keymapDB.parse(k))),
        onlyCustom,
      });

      /* Work out the LED count as the Combo Editor does, or parseColormapRaw splits the blob at the wrong stride */
      const keyboardLEDs = currentDevice.device.keyboard.ledsLeft.length + currentDevice.device.keyboard.ledsRight.length;
      const underglow = currentDevice.device.keyboardUnderglow;
      const underglowLEDs =
        (underglow.ledsLeft?.length ?? 0) + (underglow.ledsRight?.length ?? 0) || underglow.rows * underglow.columns;
      const paletteRaw = (await currentDevice.command("palette")) as string;
      const colormapRaw = (await currentDevice.command("colormap.map")) as string;

      setPalette(parsePaletteRaw(paletteRaw, currentDevice.device.RGBWMode));
      setColormaps(parseColormapRaw(colormapRaw, keyboardLEDs + underglowLEDs));
      setDeviceName(currentDevice.device.info.product ?? "");
    },
    [keymapDB],
  );

  const load = useCallback(async () => {
    const { currentDevice } = state;

    if (!currentDevice) {
      setLoadingData(false);
      setLoading(false);
      return;
    }

    setLoadingData(true);

    try {
      if (!store.get("capabilities.dualFunction")) {
        setLoadState("unsupported");
        replaceAll([]);
        return;
      }

      await loadKeyboardView(currentDevice);

      /* Show "Use global" without a value for a global setting that can not be read */
      setGlobals({
        holdTimeout: parseNumber(await currentDevice.command("qukeys.holdTimeout")),
        quickTapTerm: store.get("capabilities.quickTap") ? await readQuickTapTerm(currentDevice) : null,
        priorInterval: parseNumber(await currentDevice.command("qukeys.minimumPriorInterval")),
        options: await readDualFunctionGlobals(currentDevice),
      });

      const read = await readPerKeyOverrides(currentDevice);

      if (read === null) {
        log.warn("[DualFunctionKeys] qukeys.perKey could not be read");
        setLoadState("failed");
        replaceAll([]);
      } else {
        setLoadState("ready");
        replaceAll(read);
      }
    } catch (error) {
      log.error("[DualFunctionKeys] failed to load", error);
      setLoadState("failed");
      replaceAll([]);
    } finally {
      setLoadingData(false);
      setLoading(false);
    }
  }, [state, setLoading, replaceAll, loadKeyboardView]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Save                                                                    */
  /* ---------------------------------------------------------------------- */

  const onSave = async () => {
    const { currentDevice } = state;

    if (!currentDevice || locked || validatePerKeyOverrides(listRef.current) !== null) {
      return;
    }

    const saving = listRef.current;
    const snapshot = serializePerKeyOverrides(saving);
    setIsSaving(true);

    try {
      await writePerKeyOverrides(currentDevice, saving);

      /* Back up after every save, as the other editors do. For a virtual keyboard the backup writes the file that holds the save */
      await backupAfterSave(
        currentDevice.file !== false,
        async () => {
          const chipID = await currentDevice.command("hardware.chip_id");
          const neuronID = typeof chipID === "string" ? chipID.replace(/\s/g, "") : "";
          const commands = await Backup.Commands(currentDevice);
          const backup = await bkp.DoBackup(commands, neuronID, currentDevice);
          Backup.SaveBackup(backup, currentDevice);
        },
        error => log.warn("[DualFunctionKeys] backup after save failed", error),
      );
    } catch (error) {
      log.error("[DualFunctionKeys] failed to save", error);
      toast.error(<ToastMessage title={strings.title} content={`${strings.saveFailed} ${String(error)}`} />, { autoClose: 4000 });
      setIsSaving(false);
      return;
    }

    const unchanged = serializePerKeyOverrides(listRef.current) === snapshot;
    setModified(!unchanged);

    if (unchanged) {
      cancelContext();
    }

    toast.success(<ToastMessage title={strings.savedTitle} content={strings.saved} />, { autoClose: 2000 });
    setIsSaving(false);
  };

  const destroyContext = async () => {
    setModified(false);
    cancelContext();
    await load();
  };

  /* ---------------------------------------------------------------------- */
  /* Editing                                                                 */
  /* ---------------------------------------------------------------------- */

  const commit = (next: PerKeyOverride[]) => {
    if (locked) {
      return;
    }

    setList(next);
    listRef.current = next;
    setModified(true);
    startContext();
  };

  const changeSelected = (patch: OverridePatch) => {
    if (selected !== null) {
      commit(updateOverride(listRef.current, selected, patch));
    }
  };

  const clearSelected = () => {
    if (selected !== null) {
      commit(clearOverride(listRef.current, selected));
    }
  };

  const clearAll = () => {
    commit([]);
  };

  const onKeyboardKeySelect = (event: React.MouseEvent<Element>) => {
    const position = parseInt(event.currentTarget.getAttribute("data-key-index") ?? "", 10);

    if (VALID_POSITIONS.includes(position)) {
      setSelected(position);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Render helpers                                                          */
  /* ---------------------------------------------------------------------- */

  /* Number layers as the firmware does, the default layers first unless only custom layers are in use, and offer the custom ones */
  const customOffset = keymap.onlyCustom ? 0 : keymap.default.length;
  const layerOptions = useMemo(() => keymap.custom.map((_, index) => index + customOffset), [keymap, customOffset]);
  const viewLayer = layerOptions.includes(shownLayer) ? shownLayer : (layerOptions[0] ?? 0);

  const layerLabel = (layer: number) => `${layer + 1}: ${layerNames[layer] || `L${layer + 1}`}`;

  /* Show macro and superkey names as the Layout Editor does */
  const withName = useCallback(
    (key: KeyType): KeyType => {
      if (!key || typeof key.label !== "string" || /\p{L}/u.test(key.label)) {
        return key;
      }

      let name: string | undefined;

      if (key.extraLabel === "MACRO") {
        name = macros[key.keyCode - MACRO_FIRST]?.name;
      }

      if (key.extraLabel === "SUPER") {
        name = superkeys[key.keyCode - SUPERKEY_FIRST]?.name;
      }

      return name ? { ...key, label: name.substring(0, 5) } : key;
    },
    [macros, superkeys],
  );

  const layerData = useMemo((): KeyType[] => {
    let layer: KeyType[];

    if (keymap.onlyCustom) {
      layer = keymap.custom[viewLayer] ?? keymap.custom[0] ?? [];
    } else if (viewLayer < keymap.default.length) {
      layer = keymap.default[viewLayer] ?? [];
    } else {
      layer = keymap.custom[viewLayer - keymap.default.length] ?? keymap.custom[0] ?? keymap.default[0] ?? [];
    }

    return layer.map(withName);
  }, [keymap, viewLayer, withName]);

  const colormap = colormaps[viewLayer - customOffset] ?? colormaps[0] ?? [];

  const badgeStyles = useMemo(() => `${dualFunctionBadgeBaseStyles(SCOPE)}\n${dualFunctionBadgeStyles(list, SCOPE)}`, [list]);

  const KeyboardComponent = state.currentDevice?.device?.components?.keymap as React.FC<any> | undefined;

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  if (loadingData) {
    return <LogoLoader centered />;
  }

  if (loadState === "unsupported") {
    return (
      <div className="px-3">
        <PageHeader text={strings.title} contentSelector={false} showSaving={false} />
        <Callout size="sm" className="mt-4">
          <p>{strings.unsupported}</p>
        </Callout>
      </div>
    );
  }

  return (
    <Styles className="dualFunctionKeysEditor px-3">
      <style>{badgeStyles}</style>

      <PageHeader
        text={strings.title}
        showSaving
        contentSelector={<span className="text-ssm text-gray-400 dark:text-gray-200">{`${list.length} ${strings.counter}`}</span>}
        saveContext={onSave}
        destroyContext={destroyContext}
        inContext={modified}
        isSaving={isSaving}
        saveDisabled={loadState !== "ready" || isSaving || validatePerKeyOverrides(list) !== null}
        saveButtonRef={saveButtonRef}
        discardChangesButtonRef={discardChangesButtonRef}
      />

      <Callout size="sm" className="mt-4">
        <p>{strings.intro}</p>
        <p>{strings.introLayers}</p>
      </Callout>

      {loadState === "failed" && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <p className="text-ssm text-red-200">{strings.loadFailed}</p>
          <Button variant="outline" size="sm" disabled={isSaving} onClick={destroyContext}>
            {strings.reload}
          </Button>
        </div>
      )}

      {loadState === "ready" && (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <Heading headingLevel={4} renderAs="paragraph-sm" className="mb-1">
                {strings.layer}
              </Heading>
              <Select value={String(viewLayer)} onValueChange={value => setShownLayer(parseInt(value, 10))}>
                <SelectTrigger className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {layerOptions.map(layer => (
                    <SelectItem value={String(layer)} key={`df-layer-${layer}`}>
                      {layerLabel(layer)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" disabled={locked || list.length === 0} onClick={clearAll}>
              {strings.clearAll}
            </Button>
          </div>

          <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1">
              {KeyboardComponent && layerData.length > 0 ? (
                <div className="dualFunctionKeyboard LayerHolder">
                  <KeyboardComponent
                    readOnly={false}
                    index={0}
                    keymap={layerData}
                    onKeySelect={onKeyboardKeySelect}
                    selectedKey={selected ?? -1}
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
            </div>
            <div className="w-full xl:w-[360px] xl:shrink-0">
              {selected === null ? (
                <p className="text-center text-ssm text-gray-400 dark:text-gray-300">{strings.pickKey}</p>
              ) : (
                <OverridePanel
                  override={overrideAt(list, selected)}
                  keyData={layerData[selected]}
                  role={keyRole(layerData[selected]?.keyCode, superkeys)}
                  globals={globals}
                  disabled={locked}
                  onChange={changeSelected}
                  onClear={clearSelected}
                />
              )}
            </div>
          </div>
        </>
      )}
    </Styles>
  );
}

export default DualFunctionKeysEditor;
