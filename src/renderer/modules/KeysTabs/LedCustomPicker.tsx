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

import React, { useEffect, useState } from "react";
import { ColorResult, SketchPicker } from "react-color";
import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import { Slider } from "@Renderer/components/atoms/slider";
import { LedCustomPicker as LedCustomPickerProps } from "@Renderer/types/ledCustom";
import {
  LED_PICKER_TYPES,
  LED_TYPE_LAYERS,
  LED_TYPE_OFF,
  LED_TYPE_RAINBOW,
  LED_TYPE_SOLID,
  LED_TYPE_STALKER,
  LED_TYPE_WAVE,
  LedCustomSlot,
  RAINBOW_SPEED_DEFAULT,
  RAINBOW_SPEED_MAX,
  RAINBOW_SPEED_MIN,
  canonicalLedSlot,
  sameLedSettings,
} from "../../../api/parsers/ledCustom";

const DEFAULT_SETTINGS: LedCustomSlot = { type: LED_TYPE_SOLID, r: 255, g: 255, b: 255, speed: 0 };

const typeLabel = (type: number): string => {
  const names: Record<number, string> = {
    [LED_TYPE_SOLID]: i18n.editor.ledCustom.types.solid,
    [LED_TYPE_RAINBOW]: i18n.editor.ledCustom.types.rainbow,
    [LED_TYPE_WAVE]: i18n.editor.ledCustom.types.wave,
    [LED_TYPE_STALKER]: i18n.editor.ledCustom.types.stalker,
    [LED_TYPE_LAYERS]: i18n.editor.ledCustom.types.layers,
    [LED_TYPE_OFF]: i18n.editor.ledCustom.types.off,
  };

  return names[type] ?? String(type);
};

/* Start a new type from its defaults, keeping the colour when there is one */
const withType = (settings: LedCustomSlot, type: number): LedCustomSlot => {
  if (type === LED_TYPE_RAINBOW) {
    return { ...settings, type, speed: settings.type === LED_TYPE_RAINBOW ? settings.speed : RAINBOW_SPEED_DEFAULT };
  }

  return { ...settings, type };
};

/** The custom effect block: a type, the settings that type uses and a button that gives the key a slot with them. */
const LedCustomPicker = ({ current, onSelect, disabledReason }: LedCustomPickerProps) => {
  const [draft, setDraft] = useState<LedCustomSlot>(current ?? DEFAULT_SETTINGS);
  const [colorOpen, setColorOpen] = useState(false);
  const currentKey = current === null ? "" : JSON.stringify(canonicalLedSlot(current));

  /* Show the selected key's settings whenever another key or slot is selected */
  useEffect(() => {
    setDraft(current ?? DEFAULT_SETTINGS);
    setColorOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const assigned = current !== null && sameLedSettings(current, draft);
  const disabled = disabledReason !== undefined;
  const swatch = `rgb(${draft.r}, ${draft.g}, ${draft.b})`;

  return (
    <div className="ledCustomPicker mt-4" data-testid="ledCustomPicker">
      <p className="text-ssm font-semibold text-gray-500 dark:text-gray-50 m-0">{i18n.editor.ledCustom.title}</p>
      <p className="description text-ssm font-medium text-gray-400 dark:text-gray-200">
        {disabledReason ?? i18n.editor.ledCustom.description}
      </p>
      <div className={`flex flex-wrap items-center gap-2 mt-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="min-w-[160px]">
          <Select
            value={String(draft.type)}
            onValueChange={value => setDraft(withType(draft, parseInt(value, 10)))}
            disabled={disabled}
          >
            <SelectTrigger variant="comboButton" size="sm" aria-label={i18n.editor.ledCustom.type}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LED_PICKER_TYPES.map(type => (
                <SelectItem value={String(type)} key={`ledCustomType-${type}`}>
                  {typeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {draft.type === LED_TYPE_SOLID && (
          <div className="relative">
            <Button variant="config" size="sm" className="gap-2" onClick={() => setColorOpen(!colorOpen)} disabled={disabled}>
              <span className="inline-block w-3 h-3 rounded-full border border-gray-300" style={{ background: swatch }} />
              {i18n.editor.ledCustom.color}
            </Button>
            {colorOpen && (
              <div className="absolute z-50 mt-2">
                <SketchPicker
                  color={{ r: draft.r, g: draft.g, b: draft.b }}
                  disableAlpha
                  presetColors={[]}
                  onChange={(color: ColorResult) => setDraft({ ...draft, r: color.rgb.r, g: color.rgb.g, b: color.rgb.b })}
                  width="220px"
                />
              </div>
            )}
          </div>
        )}
        {draft.type === LED_TYPE_RAINBOW && (
          <div className="flex flex-col min-w-[200px]">
            <span className="text-ssm text-gray-400 dark:text-gray-200">
              {i18n.editor.ledCustom.speed.replace("{ms}", String(canonicalLedSlot(draft).speed))}
            </span>
            <Slider
              value={[canonicalLedSlot(draft).speed]}
              onValueChange={([speed]) => setDraft({ ...draft, speed })}
              min={RAINBOW_SPEED_MIN}
              max={RAINBOW_SPEED_MAX}
              step={5}
              disabled={disabled}
            />
          </div>
        )}
        <Button
          variant="config"
          size="sm"
          selected={assigned}
          disabled={disabled}
          onClick={() => {
            setColorOpen(false);
            onSelect(canonicalLedSlot(draft));
          }}
        >
          {assigned ? i18n.editor.ledCustom.assigned : i18n.editor.ledCustom.assign}
        </Button>
      </div>
    </div>
  );
};

export default LedCustomPicker;
