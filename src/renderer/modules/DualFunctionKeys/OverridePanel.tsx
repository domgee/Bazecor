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

import React from "react";

import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import Heading from "@Renderer/components/atoms/Heading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import { Slider } from "@Renderer/components/atoms/slider";
import CustomRadioCheckBox from "@Renderer/components/molecules/Form/CustomRadioCheckBox";
import KeyLabel from "@Renderer/components/molecules/KeyTags/KeyLabel";
import { DualFunctionGlobalPreview } from "@Renderer/types/dualFunctionKeys";
import { KeyType } from "@Renderer/types/layout";

import {
  DUAL_FUNCTION_MODES,
  MODE_HOLD_ON_OTHER_KEY,
  MODE_PERMISSIVE,
  MODE_TIMEOUT_ONLY,
  PerKeyOverride,
  handOfPosition,
  isOverrideEmpty,
} from "../../../api/parsers/dualFunction";
import {
  GLOBAL_CHOICE,
  HOLD_TIMEOUT_RANGE,
  KeyRole,
  OverridePatch,
  PRIOR_INTERVAL_RANGE,
  QUICK_TAP_RANGE,
  TriStateField,
  modeChoice,
  modeFromChoice,
  sliderBounds,
  startValue,
  triStateChoice,
  triStateFromChoice,
} from "./overrideTable";

const COLS = 12;

type Range = { min: number; max: number; step: number; fallback: number };

interface NumericRowProps {
  id: string;
  label: string;
  tip?: string;
  value: number | null;
  global: number | null;
  range: Range;
  format: (value: number) => string;
  disabled: boolean;
  onChange: (value: number | null) => void;
}

const strings = () => i18n.editor.dualFunctionKeys;

const globalLabel = (text: string | null) =>
  text === null ? strings().useGlobal : strings().useGlobalValue.replace("{0}", text);

const formatMs = (value: number) => strings().ms.replace("{0}", String(value));

const formatQuickTap = (value: number) => (value === 0 ? strings().off : formatMs(value));

const formatOnOff = (value: boolean) => (value ? strings().on : strings().off);

const modeLabel = (mode: number): string => {
  const labels: Record<number, string> = {
    [MODE_PERMISSIVE]: i18n.keyboardSettings.qukeys.modePermissive,
    [MODE_HOLD_ON_OTHER_KEY]: i18n.keyboardSettings.qukeys.modeHoldOnOtherKey,
    [MODE_TIMEOUT_ONLY]: i18n.keyboardSettings.qukeys.modeTimeoutOnly,
  };

  return labels[mode] ?? String(mode);
};

function NumericRow({ id, label, tip, value, global, range, format, disabled, onChange }: NumericRowProps) {
  const bounds = value === null ? range : sliderBounds(value, range);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Heading headingLevel={4} renderAs="paragraph-sm">
          {label}
        </Heading>
        {value !== null && <span className="text-ssm whitespace-nowrap">{format(value)}</span>}
      </div>
      <CustomRadioCheckBox
        label={globalLabel(global === null ? null : format(global))}
        type="checkbox"
        id={`df-${id}-global`}
        name={`df-${id}-global`}
        checked={value === null}
        disabled={disabled}
        onClick={checked => onChange(checked ? null : startValue(global, range))}
        className="mt-0"
      />
      {value !== null && (
        <Slider
          min={bounds.min}
          max={bounds.max}
          step={range.step}
          value={[value]}
          disabled={disabled}
          onValueChange={(next: number[]) => onChange(next[0])}
        />
      )}
      {tip && <p className="text-ssm text-gray-400 dark:text-gray-300">{tip}</p>}
    </div>
  );
}

interface OverridePanelProps {
  override: PerKeyOverride;
  keyData: KeyType | undefined;
  role: KeyRole;
  globals: DualFunctionGlobalPreview;
  disabled: boolean;
  onChange: (patch: OverridePatch) => void;
  onClear: () => void;
}

function OverridePanel({ override, keyData, role, globals, disabled, onChange, onClear }: OverridePanelProps) {
  const s = strings();
  const { position } = override;
  const hand = handOfPosition(position);
  const handLabels = { left: s.handLeft, right: s.handRight, thumb: s.handThumb };
  const { options } = globals;

  const triStates: { field: TriStateField; label: string; global: boolean | null }[] = [
    { field: "chordal", label: s.chordal, global: options?.chordal ?? null },
    { field: "speculative", label: s.speculative, global: options?.speculative ?? null },
    { field: "retro", label: s.retro, global: options?.retro ?? null },
  ];

  const changeMode = (choice: string) => {
    const mode = modeFromChoice(choice);

    if (mode !== undefined) {
      onChange({ mode });
    }
  };

  const changeTriState = (field: TriStateField, choice: string) => {
    const value = triStateFromChoice(choice);

    if (value !== undefined) {
      onChange({ [field]: value });
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-regular bg-gray-25/50 dark:bg-gray-400/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Heading headingLevel={3} renderAs="h4" className="flex items-center gap-2">
            {keyData && <KeyLabel keyData={keyData} />}
          </Heading>
          <p className="text-ssm text-gray-400 dark:text-gray-300">
            {`${s.position.replace("{0}", `R${Math.floor(position / COLS)}C${position % COLS}`)}${hand ? ` · ${handLabels[hand]}` : ""}`}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={disabled || isOverrideEmpty(override)} onClick={onClear}>
          {s.clearKey}
        </Button>
      </div>

      {role === "other" && <p className="text-ssm font-semibold text-orange-200">{s.notDualFunction}</p>}
      {role === "swapHands" && <p className="text-ssm font-semibold text-orange-200">{s.swapHands}</p>}

      <NumericRow
        id="hold-timeout"
        label={s.holdTimeout}
        value={override.holdTimeout}
        global={globals.holdTimeout}
        range={HOLD_TIMEOUT_RANGE}
        format={formatMs}
        disabled={disabled}
        onChange={holdTimeout => onChange({ holdTimeout })}
      />
      <NumericRow
        id="quick-tap"
        label={s.quickTapTerm}
        tip={s.quickTapTermTip}
        value={override.quickTapTerm}
        global={globals.quickTapTerm}
        range={QUICK_TAP_RANGE}
        format={formatQuickTap}
        disabled={disabled}
        onChange={quickTapTerm => onChange({ quickTapTerm })}
      />
      <NumericRow
        id="prior-interval"
        label={s.priorInterval}
        value={override.priorInterval}
        global={globals.priorInterval}
        range={PRIOR_INTERVAL_RANGE}
        format={formatMs}
        disabled={disabled}
        onChange={priorInterval => onChange({ priorInterval })}
      />

      <div className="flex flex-col gap-1">
        <Heading headingLevel={4} renderAs="paragraph-sm">
          {s.mode}
        </Heading>
        <Select value={modeChoice(override.mode)} onValueChange={changeMode} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL_CHOICE}>{globalLabel(options ? modeLabel(options.mode) : null)}</SelectItem>
            {DUAL_FUNCTION_MODES.map(mode => (
              <SelectItem value={String(mode)} key={`df-mode-${mode}`}>
                {modeLabel(mode)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {triStates.map(({ field, label, global }) => (
        <div className="flex flex-col gap-1" key={`df-${field}`}>
          <Heading headingLevel={4} renderAs="paragraph-sm">
            {label}
          </Heading>
          <Select
            value={triStateChoice(override[field])}
            onValueChange={choice => changeTriState(field, choice)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL_CHOICE}>{globalLabel(global === null ? null : formatOnOff(global))}</SelectItem>
              <SelectItem value={triStateChoice(true)}>{s.on}</SelectItem>
              <SelectItem value={triStateChoice(false)}>{s.off}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

export default OverridePanel;
