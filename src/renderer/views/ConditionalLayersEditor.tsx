/* eslint-disable no-bitwise */
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
import log from "electron-log/renderer";
import { toast } from "react-toastify";

import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import LogoLoader from "@Renderer/components/atoms/loader/LogoLoader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import Callout from "@Renderer/components/molecules/Callout/Callout";
import CustomRadioCheckBox from "@Renderer/components/molecules/Form/CustomRadioCheckBox";
import { PageHeader } from "@Renderer/modules/PageHeader";
import backupAfterSave from "@Renderer/modules/KeyOverrides/backupAfterSave";
import { useDevice } from "@Renderer/DeviceContext";
import Store from "@Renderer/utils/Store";
import { ConditionalLayerRule, ConditionalLayersEditorProps, ConditionalLayersState } from "@Renderer/types/conditionalLayers";
import { Neuron } from "@Renderer/types/neurons";

import Backup from "../../api/backup";
import {
  CL_LAYER_COUNT,
  MAX_CONDITIONAL_LAYERS,
  duplicateOf,
  layerBits,
  newConditionalLayer,
  readConditionalLayers,
  serializeConditionalLayers,
  thenLayerOptions,
  toggleIfLayer,
  validateConditionalLayers,
  writeConditionalLayers,
} from "../../api/parsers/conditionalLayers";

const store = Store.getStore();
const bkp = new Backup();

const LAYERS = Array.from({ length: CL_LAYER_COUNT }, (_, layer) => layer);

type Row = { id: number; value: ConditionalLayerRule };

function ConditionalLayersEditor(props: ConditionalLayersEditorProps) {
  const { startContext, cancelContext, setLoading, saveButtonRef, discardChangesButtonRef } = props;
  const { state } = useDevice();
  const strings = i18n.editor.conditionalLayers;

  const [rows, setRows] = useState<Row[]>([]);
  const [loadState, setLoadState] = useState<ConditionalLayersState>("unsupported");
  const [loadingData, setLoadingData] = useState(true);
  const [modified, setModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [layerNames, setLayerNames] = useState<string[]>([]);
  const nextId = useRef(0);
  /* The list as the last render or edit left it, so a save can tell whether anything changed while it ran */
  const listRef = useRef<ConditionalLayerRule[]>([]);

  const list = useMemo(() => rows.map(row => row.value), [rows]);
  const locked = isSaving || loadState !== "ready";
  const invalid = validateConditionalLayers(list);

  const layerLabel = (layer: number) => `${layer + 1}: ${layerNames[layer] || `L${layer + 1}`}`;

  /* ---------------------------------------------------------------------- */
  /* Load                                                                    */
  /* ---------------------------------------------------------------------- */

  const replaceAll = useCallback((next: ConditionalLayerRule[]) => {
    setRows(
      next.map(value => {
        nextId.current += 1;
        return { id: nextId.current, value };
      }),
    );
    listRef.current = next;
  }, []);

  const load = useCallback(async () => {
    const { currentDevice } = state;

    if (!currentDevice) {
      setLoadingData(false);
      setLoading(false);
      return;
    }

    setLoadingData(true);

    try {
      if (!store.get("capabilities.conditionalLayers")) {
        setLoadState("unsupported");
        replaceAll([]);
        return;
      }

      /* Show layer numbers only when the names can not be read */
      try {
        const chipID = await currentDevice.command("hardware.chip_id");
        const neuronID = typeof chipID === "string" ? chipID.replace(/\s/g, "") : "";
        const neurons = (store.get("neurons") as Neuron[]) ?? [];
        const neuron = neurons.find(n => n.id === neuronID);
        setLayerNames((neuron?.layers ?? []).map(layer => layer?.name ?? ""));
      } catch (error) {
        log.warn("[ConditionalLayers] layer names could not be read", error);
        setLayerNames([]);
      }

      const read = await readConditionalLayers(currentDevice);

      if (read === null) {
        log.warn("[ConditionalLayers] conditional.map could not be read");
        setLoadState("failed");
        replaceAll([]);
      } else {
        setLoadState("ready");
        replaceAll(read);
      }
    } catch (error) {
      log.error("[ConditionalLayers] failed to load", error);
      setLoadState("failed");
      replaceAll([]);
    } finally {
      setLoadingData(false);
      setLoading(false);
    }
  }, [state, setLoading, replaceAll]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Save                                                                    */
  /* ---------------------------------------------------------------------- */

  const onSave = async () => {
    const { currentDevice } = state;

    if (!currentDevice || locked || validateConditionalLayers(listRef.current) !== null) {
      return;
    }

    const saving = listRef.current;
    const snapshot = serializeConditionalLayers(saving);
    setIsSaving(true);

    try {
      await writeConditionalLayers(currentDevice, saving);

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
        error => log.warn("[ConditionalLayers] backup after save failed", error),
      );
    } catch (error) {
      log.error("[ConditionalLayers] failed to save", error);
      toast.error(<ToastMessage title={strings.title} content={`${strings.saveFailed} ${String(error)}`} />, { autoClose: 4000 });
      setIsSaving(false);
      return;
    }

    const unchanged = serializeConditionalLayers(listRef.current) === snapshot;
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

  const commit = (next: Row[]) => {
    if (locked) {
      return;
    }

    setRows(next);
    listRef.current = next.map(row => row.value);
    setModified(true);
    startContext();
  };

  const updateAt = (index: number, change: (r: ConditionalLayerRule) => ConditionalLayerRule) => {
    commit(rows.map((row, i) => (i === index ? { ...row, value: change(row.value) } : row)));
  };

  const removeAt = (index: number) => {
    commit(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    if (rows.length >= MAX_CONDITIONAL_LAYERS) {
      return;
    }

    nextId.current += 1;
    commit(rows.concat([{ id: nextId.current, value: newConditionalLayer() }]));
  };

  const changeThenLayer = (index: number, value: string) => {
    const layer = parseInt(value, 10);

    updateAt(index, current => (thenLayerOptions(current).includes(layer) ? { ...current, thenLayer: layer } : current));
  };

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
    <div className="conditionalLayersEditor px-3">
      <PageHeader
        text={strings.title}
        showSaving
        contentSelector={
          <span className="text-ssm text-gray-400 dark:text-gray-200">{`${list.length} / ${MAX_CONDITIONAL_LAYERS} ${strings.counter}`}</span>
        }
        saveContext={onSave}
        destroyContext={destroyContext}
        inContext={modified}
        isSaving={isSaving}
        saveDisabled={loadState !== "ready" || isSaving || invalid !== null}
        saveButtonRef={saveButtonRef}
        discardChangesButtonRef={discardChangesButtonRef}
      />

      <Callout size="sm" className="mt-4">
        <p>{strings.intro}</p>
        <p>{strings.introOwnership}</p>
        <p>{strings.introChain}</p>
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
        <div className="mt-6 flex flex-col gap-3">
          {rows.length === 0 && <p className="text-center text-ssm text-gray-400 dark:text-gray-300">{strings.empty}</p>}

          {rows.map((row, index) => {
            const r = row.value;
            const earlier = duplicateOf(list, index);
            const ifCount = layerBits(r.ifMask);

            return (
              <div key={row.id} className="rounded-regular bg-gray-25/50 dark:bg-gray-400/15 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-ssm font-semibold">{strings.ifLabel}</span>
                  {LAYERS.map(layer => {
                    const checked = (r.ifMask & (1 << layer)) !== 0;

                    return (
                      <CustomRadioCheckBox
                        key={`layer-${layer}`}
                        label={layerLabel(layer)}
                        type="checkbox"
                        id={`cl-${row.id}-if-${layer}`}
                        name={`cl-${row.id}-if-${layer}`}
                        checked={checked}
                        disabled={locked || layer === r.thenLayer || (checked && ifCount === 2)}
                        onClick={() => updateAt(index, current => toggleIfLayer(current, layer))}
                        className="mt-0"
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <span className="text-ssm font-semibold">{strings.thenLabel}</span>
                  <Select value={String(r.thenLayer)} onValueChange={value => changeThenLayer(index, value)} disabled={locked}>
                    <SelectTrigger className="min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {thenLayerOptions(r).map(layer => (
                        <SelectItem value={String(layer)} key={`cl-${row.id}-then-${layer}`}>
                          {layerLabel(layer)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <Button variant="outline" size="sm" disabled={locked} onClick={() => removeAt(index)}>
                      {strings.delete}
                    </Button>
                  </div>
                </div>
                {ifCount < 2 && <p className="mt-2 text-ssm font-semibold text-orange-200">{strings.tooFewIfLayers}</p>}
                {earlier >= 0 && (
                  <p className="mt-2 text-ssm font-semibold text-orange-200">
                    {strings.duplicate.replace("{0}", `${earlier + 1}`)}
                  </p>
                )}
              </div>
            );
          })}

          <div>
            <Button variant="secondary" size="sm" disabled={locked || rows.length >= MAX_CONDITIONAL_LAYERS} onClick={add}>
              {strings.add}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConditionalLayersEditor;
