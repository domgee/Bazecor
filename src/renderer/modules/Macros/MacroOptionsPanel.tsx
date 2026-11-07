import React from "react";
import { i18n } from "@Renderer/i18n";
import { Button } from "@Renderer/components/atoms/Button";
import { Checkbox } from "@Renderer/components/atoms/Checkbox";
import { Label } from "@Renderer/components/atoms/Label";
import Heading from "@Renderer/components/atoms/Heading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@Renderer/components/atoms/Select";
import { MacroOptions, MacrosType } from "@Renderer/types/macros";
import { MACRO_STEP } from "../../../api/parsers/macros";
import { canAddMarker, effectiveOptions, hasMacroOptions, loopModesAllowed } from "./macroOptions";

interface MacroOptionsPanelProps {
  macro: MacrosType;
  macroUpgrade: boolean;
  /* The firmware plays Pause until layer off */
  layerPause: boolean;
  onOptionsChange: (options: MacroOptions) => void;
  onAddMarker: (type: number) => void;
  onResetOptions: () => void;
}

const MacroOptionsPanel = ({ macro, macroUpgrade, layerPause, onOptionsChange, onAddMarker, onResetOptions }: MacroOptionsPanelProps) => {
  const strings = i18n.editor.macros.options;

  // Offer only a way back to a macro older firmware can play
  if (!macroUpgrade) {
    if (!hasMacroOptions(macro)) {
      return null;
    }

    return (
      <div className="macroOptionsPanel mt-4 flex flex-col gap-2">
        <p className="text-ssm text-gray-500 dark:text-gray-300 m-0">{strings.unsupported}</p>
        <Button variant="outline" size="sm" onClick={onResetOptions} className="w-full">
          {strings.resetClassic}
        </Button>
      </div>
    );
  }

  const options = effectiveOptions(macro);
  const loopsAllowed = loopModesAllowed(macro);
  const markerAllowed = canAddMarker(macro);
  const setOption = (change: Partial<MacroOptions>) => onOptionsChange({ ...options, ...change });

  return (
    <div className="macroOptionsPanel mt-4 flex flex-col gap-3">
      <Heading headingLevel={4} renderAs="h4" className="m-0">
        {strings.title}
      </Heading>
      <div className="flex flex-col gap-1">
        <Label htmlFor="macroPlayMode" className="text-ssm">
          {strings.play}
        </Label>
        <Select value={String(options.mode)} onValueChange={value => setOption({ mode: Number(value) as MacroOptions["mode"] })}>
          <SelectTrigger id="macroPlayMode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{strings.modeOnce}</SelectItem>
            <SelectItem value="1" disabled={!loopsAllowed}>
              {strings.modeRepeat}
            </SelectItem>
            <SelectItem value="2" disabled={!loopsAllowed}>
              {strings.modeToggle}
            </SelectItem>
          </SelectContent>
        </Select>
        {!loopsAllowed && <p className="text-ssm text-gray-400 dark:text-gray-300 m-0">{strings.loopBlocked}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="macroIgnoreMods"
          checked={options.ignoreMods}
          onCheckedChange={checked => setOption({ ignoreMods: checked === true })}
        />
        <Label htmlFor="macroIgnoreMods" className="text-ssm">
          {strings.ignoreMods}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="macroOtherKeysStop"
          checked={options.otherKeysStop}
          onCheckedChange={checked => setOption({ otherKeysStop: checked === true })}
        />
        <Label htmlFor="macroOtherKeysStop" className="text-ssm">
          {strings.otherKeysStop}
        </Label>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onAddMarker(MACRO_STEP.RELEASE)}
        disabled={!markerAllowed}
        className="w-full"
      >
        {strings.addMarker}
      </Button>
      {layerPause && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddMarker(MACRO_STEP.LAYER_OFF)}
          disabled={!markerAllowed}
          className="w-full"
        >
          {strings.addLayerMarker}
        </Button>
      )}
      <p className="text-ssm text-gray-400 dark:text-gray-300 m-0">{strings.markerHint}</p>
      {layerPause && <p className="text-ssm text-gray-400 dark:text-gray-300 m-0">{strings.layerMarkerHint}</p>}
      <p className="text-ssm text-gray-400 dark:text-gray-300 m-0">{strings.unicodeNote}</p>
    </div>
  );
};

export default MacroOptionsPanel;
