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
import { Button } from "@Renderer/components/atoms/Button";
import Heading from "@Renderer/components/atoms/Heading";
import { i18n } from "@Renderer/i18n";
import { AltRepeatBlock, AltRepeatRule, AltRepeatState } from "@Renderer/types/altRepeat";
import { KeymapDB } from "../../../api/keymap";
import { MAX_ALT_REPEAT_RULES } from "../../../api/parsers/altRepeat";
import PreviousKeyLabel from "./PreviousKeyLabel";

interface AltRepeatTabsProps {
  state: AltRepeatState;
  /** This key's rules, in tab order. */
  rules: AltRepeatRule[];
  /** Index into `rules`, -1 for Default. */
  selected: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onChangePrevious: () => void;
  onDelete: () => void;
  onReload: () => void;
  /** Rules on the whole keyboard. */
  totalCount: number;
  block: AltRepeatBlock | null;
  replacesTap: boolean;
  noKeyDefault?: boolean;
  keymapDB: KeymapDB;
}

/** The Default tab, one tab per previous key and "+" for the selected key in the Layout editor. */
const AltRepeatTabs = (props: AltRepeatTabsProps) => {
  const {
    state,
    rules,
    selected,
    onSelect,
    onAdd,
    onChangePrevious,
    onDelete,
    onReload,
    totalCount,
    block,
    replacesTap,
    noKeyDefault = false,
    keymapDB,
  } = props;
  const strings = i18n.editor.altRepeat;

  if (state === "unsupported") {
    return null;
  }

  if (state === "failed") {
    return (
      <div className="altRepeatTabs mt-4 flex flex-wrap items-center gap-4">
        <p className="text-ssm text-red-200">{strings.loadFailed}</p>
        <Button variant="outline" size="sm" onClick={onReload}>
          {strings.reload}
        </Button>
      </div>
    );
  }

  if (block !== null && rules.length === 0) {
    return null;
  }

  const selectedRule = selected >= 0 && selected < rules.length ? rules[selected] : null;

  return (
    <div className="altRepeatTabs mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="tablist">
        <Button variant="config" size="sm" role="tab" selected={selectedRule === null} onClick={() => onSelect(-1)}>
          {strings.defaultTab}
        </Button>
        {rules.map((rule, index) => (
          <Button
            key={`altrepeat-tab-${rule.previous}`}
            variant="config"
            size="sm"
            role="tab"
            selected={selectedRule !== null && selected === index}
            onClick={() => onSelect(index)}
          >
            <span className="mr-1">{strings.after}</span>
            <PreviousKeyLabel code={rule.previous} keymapDB={keymapDB} />
          </Button>
        ))}
        <Button
          variant="config"
          size="sm"
          aria-label={strings.add}
          title={strings.add}
          disabled={totalCount >= MAX_ALT_REPEAT_RULES || block !== null}
          onClick={onAdd}
        >
          +
        </Button>
        <span className="ml-2 text-ssm text-gray-400 dark:text-gray-200">
          {`${totalCount}/${MAX_ALT_REPEAT_RULES} ${strings.counter}`}
        </span>
      </div>
      {block !== null && <p className="text-ssm text-red-200">{`${strings.blocked[block]} ${strings.inactive}`}</p>}
      {block === null && replacesTap && <p className="text-ssm text-gray-400 dark:text-gray-200">{strings.replacesTap}</p>}
      {block === null && noKeyDefault && <p className="text-ssm text-gray-400 dark:text-gray-200">{strings.noKeyHint}</p>}
      {selectedRule !== null && (
        <div className="flex flex-wrap items-center gap-3">
          <Heading headingLevel={4} renderAs="paragraph-sm" className="flex items-center gap-1">
            <span>{strings.outputTitle}</span>
            <PreviousKeyLabel code={selectedRule.previous} keymapDB={keymapDB} />
          </Heading>
          <Button variant="outline" size="sm" disabled={block !== null} onClick={onChangePrevious}>
            {strings.change}
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            {strings.delete}
          </Button>
        </div>
      )}
    </div>
  );
};

export default AltRepeatTabs;
