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
import Heading from "@Renderer/components/atoms/Heading";
import LogoLoader from "@Renderer/components/atoms/loader/LogoLoader";
import ToastMessage from "@Renderer/components/atoms/ToastMessage";
import Callout from "@Renderer/components/molecules/Callout/Callout";
import CustomRadioCheckBox from "@Renderer/components/molecules/Form/CustomRadioCheckBox";
import { PageHeader } from "@Renderer/modules/PageHeader";
import PreviousKeyLabel from "@Renderer/modules/AltRepeat/PreviousKeyLabel";
import KeyOverrideKeyDialog from "@Renderer/modules/KeyOverrides/KeyOverrideKeyDialog";
import ReplacementLabel from "@Renderer/modules/KeyOverrides/ReplacementLabel";
import backupAfterSave from "@Renderer/modules/KeyOverrides/backupAfterSave";
import { useDevice } from "@Renderer/DeviceContext";
import Store from "@Renderer/utils/Store";
import getLanguage from "@Renderer/utils/language";
import { KeyOverride, KeyOverridesEditorProps, KeyOverridesState } from "@Renderer/types/keyOverrides";

import { KeymapDB } from "../../api/keymap";
import Backup from "../../api/backup";
import {
  KO_ALL_LAYERS,
  KO_LAYER_COUNT,
  KO_MODIFIERS,
  KO_NEGATIVE_MOD_UP,
  KO_NO_REREGISTER,
  KO_NO_UNREGISTER_ON_OTHER,
  KO_ONE_MOD,
  KO_REQUIRED_MOD_DOWN,
  KO_TRIGGER_DOWN,
  MAX_KEY_OVERRIDES,
  anyOneRequired,
  isLastActivation,
  layerSummary,
  moveKeyOverride,
  newKeyOverride,
  optionChecked,
  overlapsEarlier,
  readKeyOverrides,
  serializeKeyOverrides,
  splitTriggerCode,
  toggleOption,
  triggerCode,
  validateKeyOverrides,
  withTriggerMods,
  writeKeyOverrides,
} from "../../api/parsers/keyOverrides";

const store = Store.getStore();
const bkp = new Backup();

const MODIFIER_NAMES = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  gui: process.platform === "darwin" ? "Cmd" : "Win",
};

const LAYERS = Array.from({ length: KO_LAYER_COUNT }, (_, layer) => layer);

type Row = { id: number; value: KeyOverride };

/* An index of null adds a new override. A new override's trigger waits in `pending` while its output is picked */
type DialogState =
  | { kind: "trigger"; index: number | null }
  | { kind: "replacement"; index: number | null; pending?: { trigger: number; triggerMods: number } }
  | null;

function KeyOverridesEditor(props: KeyOverridesEditorProps) {
  const { startContext, cancelContext, setLoading, saveButtonRef, discardChangesButtonRef } = props;
  const { state } = useDevice();
  const strings = i18n.editor.keyOverrides;

  const [rows, setRows] = useState<Row[]>([]);
  const [loadState, setLoadState] = useState<KeyOverridesState>("unsupported");
  const [loadingData, setLoadingData] = useState(true);
  const [modified, setModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const nextId = useRef(0);
  /* The list as the last render or edit left it, so a save can tell whether anything changed while it ran */
  const listRef = useRef<KeyOverride[]>([]);

  const keymapDB = useMemo(() => new KeymapDB(), []);
  const currentLanguageLayout = getLanguage(store.get("settings.language") as string) || "en-US";
  const list = useMemo(() => rows.map(row => row.value), [rows]);
  const locked = isSaving || loadState !== "ready";
  const invalid = validateKeyOverrides(list);

  /* ---------------------------------------------------------------------- */
  /* Load                                                                    */
  /* ---------------------------------------------------------------------- */

  const replaceAll = useCallback((next: KeyOverride[]) => {
    setRows(
      next.map(value => {
        nextId.current += 1;
        return { id: nextId.current, value };
      }),
    );
    listRef.current = next;
    setExpanded(new Set());
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
      if (!store.get("capabilities.keyOverrides")) {
        setLoadState("unsupported");
        replaceAll([]);
        return;
      }

      const read = await readKeyOverrides(currentDevice);

      if (read === null) {
        log.warn("[KeyOverrides] keyoverrides.map could not be read");
        setLoadState("failed");
        replaceAll([]);
      } else {
        setLoadState("ready");
        replaceAll(read);
      }
    } catch (error) {
      log.error("[KeyOverrides] failed to load", error);
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

    if (!currentDevice || locked || validateKeyOverrides(listRef.current) !== null) {
      return;
    }

    const saving = listRef.current;
    const snapshot = serializeKeyOverrides(saving);
    setIsSaving(true);

    try {
      await writeKeyOverrides(currentDevice, saving);

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
        error => log.warn("[KeyOverrides] backup after save failed", error),
      );
    } catch (error) {
      log.error("[KeyOverrides] failed to save", error);
      toast.error(<ToastMessage title={strings.title} content={`${strings.saveFailed} ${String(error)}`} />, { autoClose: 4000 });
      setIsSaving(false);
      return;
    }

    const unchanged = serializeKeyOverrides(listRef.current) === snapshot;
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

  const updateAt = (index: number, change: (o: KeyOverride) => KeyOverride) => {
    commit(rows.map((row, i) => (i === index ? { ...row, value: change(row.value) } : row)));
  };

  const removeAt = (index: number) => {
    commit(rows.filter((_, i) => i !== index));
  };

  const moveAt = (from: number, to: number) => {
    commit(moveKeyOverride(rows, from, to));
  };

  const toggleExpanded = (id: number) => {
    const next = new Set(expanded);

    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    setExpanded(next);
  };

  const openDialog = (next: DialogState) => {
    if (!locked) {
      setDialog(next);
    }
  };

  const onDialogConfirm = (code: number) => {
    const current = dialog;
    setDialog(null);

    if (current === null || locked) {
      return;
    }

    if (current.kind === "trigger") {
      const split = splitTriggerCode(code);

      if (split === null) {
        return;
      }

      if (current.index === null) {
        setDialog({ kind: "replacement", index: null, pending: split });
        return;
      }

      updateAt(current.index, o => ({ ...withTriggerMods(o, split.triggerMods), trigger: split.trigger }));
      return;
    }

    if (current.index === null) {
      if (!current.pending || rows.length >= MAX_KEY_OVERRIDES) {
        return;
      }

      nextId.current += 1;
      commit(
        rows.concat([{ id: nextId.current, value: newKeyOverride(current.pending.trigger, current.pending.triggerMods, code) }]),
      );
      return;
    }

    updateAt(current.index, o => ({ ...o, replacement: code }));
  };

  let dialogInitial = 0;

  if (dialog !== null && dialog.index !== null && rows[dialog.index]) {
    const o = rows[dialog.index].value;
    dialogInitial = dialog.kind === "trigger" ? triggerCode(o) : o.replacement;
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const modChips = (mask: number) =>
    KO_MODIFIERS.filter(mod => mask & mod.bit).map(mod => (
      <span key={mod.name} className="rounded-sm bg-gray-100 dark:bg-gray-500 px-1.5 py-0.5 text-ssm">
        {MODIFIER_NAMES[mod.name]}
      </span>
    ));

  const modCheckboxes = (rowId: number, group: string, mask: number, disabledMask: number, onToggle: (bit: number) => void) => (
    <div className="flex flex-wrap gap-4">
      {KO_MODIFIERS.map(mod => (
        <CustomRadioCheckBox
          key={mod.name}
          label={MODIFIER_NAMES[mod.name]}
          type="checkbox"
          id={`ko-${rowId}-${group}-${mod.name}`}
          name={`ko-${rowId}-${group}-${mod.name}`}
          checked={(mask & mod.bit) !== 0}
          disabled={locked || (disabledMask & mod.bit) !== 0}
          onClick={() => onToggle(mod.bit)}
          className="mt-0"
        />
      ))}
    </div>
  );

  const options = [
    { bit: KO_TRIGGER_DOWN, label: strings.optionTriggerDown, key: "triggerDown" },
    { bit: KO_REQUIRED_MOD_DOWN, label: strings.optionRequiredModDown, key: "requiredModDown" },
    { bit: KO_NEGATIVE_MOD_UP, label: strings.optionNegativeModUp, key: "negativeModUp" },
    { bit: KO_ONE_MOD, label: strings.optionOneMod, key: "oneMod" },
    { bit: KO_NO_REREGISTER, label: strings.optionNoReregister, key: "noReregister" },
    { bit: KO_NO_UNREGISTER_ON_OTHER, label: strings.optionNoUnregisterOnOther, key: "noUnregisterOnOther" },
  ];

  const advanced = (row: Row, index: number) => {
    const o = row.value;

    return (
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Heading headingLevel={4} renderAs="paragraph-sm">
            {strings.forbiddenTitle}
          </Heading>
          <p className="text-ssm text-gray-400 dark:text-gray-200">{strings.forbiddenHint}</p>
          {modCheckboxes(row.id, "forbidden", o.negativeMods, o.triggerMods, bit =>
            updateAt(index, current => ({ ...current, negativeMods: current.negativeMods ^ bit })),
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Heading headingLevel={4} renderAs="paragraph-sm">
            {strings.suppressedTitle}
          </Heading>
          <p className="text-ssm text-gray-400 dark:text-gray-200">{strings.suppressedHint}</p>
          <div className="flex flex-wrap items-center gap-4">
            {modCheckboxes(row.id, "suppressed", o.suppressedMods, 0, bit =>
              updateAt(index, current => ({ ...current, suppressedMods: current.suppressedMods ^ bit })),
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={locked || o.suppressedMods === o.triggerMods}
              onClick={() => updateAt(index, current => ({ ...current, suppressedMods: current.triggerMods }))}
            >
              {strings.sameAsRequired}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Heading headingLevel={4} renderAs="paragraph-sm">
            {strings.layersTitle}
          </Heading>
          <div className="flex flex-wrap items-center gap-4">
            {LAYERS.map(layer => {
              const bit = 1 << layer;
              const checked = (o.layers & bit) !== 0;

              return (
                <CustomRadioCheckBox
                  key={`layer-${layer}`}
                  label={`${layer + 1}`}
                  type="checkbox"
                  id={`ko-${row.id}-layer-${layer}`}
                  name={`ko-${row.id}-layer-${layer}`}
                  checked={checked}
                  disabled={locked || (checked && o.layers === bit)}
                  onClick={() => updateAt(index, current => ({ ...current, layers: current.layers ^ bit }))}
                  className="mt-0"
                />
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={locked || o.layers === KO_ALL_LAYERS}
              onClick={() => updateAt(index, current => ({ ...current, layers: KO_ALL_LAYERS }))}
            >
              {strings.allLayers}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Heading headingLevel={4} renderAs="paragraph-sm">
            {strings.optionsTitle}
          </Heading>
          {options.map(option => (
            <CustomRadioCheckBox
              key={option.key}
              label={option.label}
              type="checkbox"
              id={`ko-${row.id}-option-${option.key}`}
              name={`ko-${row.id}-option-${option.key}`}
              checked={optionChecked(o.options, option.bit)}
              disabled={locked || isLastActivation(o.options, option.bit)}
              onClick={() => updateAt(index, current => ({ ...current, options: toggleOption(current.options, option.bit) }))}
              className="mt-0"
            />
          ))}
        </div>
      </div>
    );
  };

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
    <div className="keyOverridesEditor px-3">
      <PageHeader
        text={strings.title}
        showSaving
        contentSelector={
          <span className="text-ssm text-gray-400 dark:text-gray-200">{`${list.length} / ${MAX_KEY_OVERRIDES} ${strings.counter}`}</span>
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
        <p>{strings.introOrder}</p>
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
            const o = row.value;
            const earlier = overlapsEarlier(list, index);

            return (
              <div key={row.id} className="rounded-regular bg-gray-25/50 dark:bg-gray-400/15 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <CustomRadioCheckBox
                    label={strings.enabled}
                    type="checkbox"
                    id={`ko-${row.id}-enabled`}
                    name={`ko-${row.id}-enabled`}
                    checked={o.enabled}
                    disabled={locked}
                    onClick={() => updateAt(index, current => ({ ...current, enabled: !current.enabled }))}
                    className="mt-0"
                  />
                  <span className="font-semibold">
                    <PreviousKeyLabel code={triggerCode(o)} keymapDB={keymapDB} />
                  </span>
                  {anyOneRequired(o) && (
                    <span className="rounded-sm bg-gray-100 dark:bg-gray-500 px-1.5 py-0.5 text-ssm">{strings.anyOne}</span>
                  )}
                  <span className="text-lg text-gray-400 dark:text-gray-300">→</span>
                  <ReplacementLabel code={o.replacement} keymapDB={keymapDB} />
                  {o.negativeMods !== 0 && (
                    <span className="flex items-center gap-1 text-ssm">
                      {strings.forbidden}
                      {modChips(o.negativeMods)}
                    </span>
                  )}
                  <span className="text-ssm text-gray-400 dark:text-gray-200">
                    {`${strings.layers}: ${layerSummary(o.layers, strings.allLayers)}`}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={locked} onClick={() => openDialog({ kind: "trigger", index })}>
                      {strings.changeTrigger}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={locked}
                      onClick={() => openDialog({ kind: "replacement", index })}
                    >
                      {strings.changeOutput}
                    </Button>
                    <Button variant="outline" size="sm" disabled={locked || index === 0} onClick={() => moveAt(index, index - 1)}>
                      {strings.moveUp}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={locked || index === rows.length - 1}
                      onClick={() => moveAt(index, index + 1)}
                    >
                      {strings.moveDown}
                    </Button>
                    <Button variant="outline" size="sm" disabled={locked} onClick={() => removeAt(index)}>
                      {strings.delete}
                    </Button>
                    <Button variant="config" size="sm" selected={expanded.has(row.id)} onClick={() => toggleExpanded(row.id)}>
                      {strings.advanced}
                    </Button>
                  </div>
                </div>
                {earlier >= 0 && (
                  <p className="mt-2 text-ssm font-semibold text-orange-200">
                    {strings.overlap.replace("{0}", `${earlier + 1}`)}
                  </p>
                )}
                {expanded.has(row.id) && advanced(row, index)}
              </div>
            );
          })}

          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={locked || rows.length >= MAX_KEY_OVERRIDES}
              onClick={() => openDialog({ kind: "trigger", index: null })}
            >
              {strings.add}
            </Button>
          </div>
        </div>
      )}

      <KeyOverrideKeyDialog
        open={dialog !== null && !locked}
        mode={dialog?.kind ?? "trigger"}
        initialCode={dialogInitial}
        keymapDB={keymapDB}
        selectedlanguage={currentLanguageLayout}
        onConfirm={onDialogConfirm}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

export default KeyOverridesEditor;
