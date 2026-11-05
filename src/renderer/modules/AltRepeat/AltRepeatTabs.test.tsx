import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AltRepeatBlock, AltRepeatRule, AltRepeatState } from "@Renderer/types/altRepeat";
import { i18n } from "@Renderer/i18n";
import { KeymapDB } from "../../../api/keymap";
import AltRepeatTabs from "./AltRepeatTabs";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const strings = i18n.editor.altRepeat;

const rules: AltRepeatRule[] = [
  { layer: 0, position: 5, previous: 6, output: 14 },
  { layer: 0, position: 5, previous: 0x1006, output: 27 },
];

const renderTabs = (options: {
  state?: AltRepeatState;
  keyRules?: AltRepeatRule[];
  selected?: number;
  totalCount?: number;
  block?: AltRepeatBlock | null;
  replacesTap?: boolean;
  allowRepeat?: boolean;
}) => {
  const handlers = {
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onChangePrevious: vi.fn(),
    onDelete: vi.fn(),
    onReload: vi.fn(),
    onToggleRepeat: vi.fn(),
  };
  const { container } = render(
    <AltRepeatTabs
      state={options.state ?? "ready"}
      rules={options.keyRules ?? rules}
      selected={options.selected ?? -1}
      totalCount={options.totalCount ?? 3}
      block={options.block ?? null}
      replacesTap={options.replacesTap ?? false}
      keymapDB={new KeymapDB()}
      onSelect={handlers.onSelect}
      onAdd={handlers.onAdd}
      onChangePrevious={handlers.onChangePrevious}
      onDelete={handlers.onDelete}
      onReload={handlers.onReload}
      allowRepeat={options.allowRepeat ?? false}
      onToggleRepeat={handlers.onToggleRepeat}
    />,
  );
  return { container, ...handlers };
};

const addButton = () => screen.getByRole("button", { name: strings.add });

const REPEAT_CHECKBOX = "#input-altRepeatKeyRepeat-checkbox";

describe("AltRepeatTabs", () => {
  afterEach(() => {
    cleanup();
  });

  test("shows Default, one tab per rule and +", () => {
    const { onSelect } = renderTabs({});

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].textContent).toBe(strings.defaultTab);
    expect(tabs[1].textContent).toContain(strings.after);
    expect(tabs[2].textContent).toMatch(/\+C$/);
    expect(addButton().hasAttribute("disabled")).toBe(false);

    fireEvent.click(tabs[2]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  test("shows the keyboard-wide counter", () => {
    renderTabs({ totalCount: 3 });

    expect(screen.getByText(`3/128 ${strings.counter}`)).not.toBeNull();
  });

  test("disables + at 128 rules", () => {
    renderTabs({ totalCount: 128 });

    expect(addButton().hasAttribute("disabled")).toBe(true);
  });

  test("a blocked default with rules shows the inactive banner and keeps delete", () => {
    renderTabs({ block: "autoshift", selected: 0 });

    expect(screen.getByText(`${strings.blocked.autoshift} ${strings.inactive}`)).not.toBeNull();
    expect(addButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: strings.change }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: strings.delete }).hasAttribute("disabled")).toBe(false);
  });

  test("a blocked default without rules renders nothing", () => {
    const { container } = renderTabs({ block: "transparent", keyRules: [] });

    expect(container.childElementCount).toBe(0);
  });

  test("shows the hint when the tabs replace a tap", () => {
    renderTabs({ replacesTap: true });

    expect(screen.getByText(strings.replacesTap)).not.toBeNull();
  });

  test("a selected tab offers Change and Delete", () => {
    const { onChangePrevious, onDelete } = renderTabs({ selected: 1 });

    fireEvent.click(screen.getByRole("button", { name: strings.change }));
    fireEvent.click(screen.getByRole("button", { name: strings.delete }));

    expect(onChangePrevious).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("a selected tab offers Apply on key repeat with the capability", () => {
    const { container, onToggleRepeat } = renderTabs({ selected: 1, allowRepeat: true });
    const checkbox = container.querySelector(REPEAT_CHECKBOX);

    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
    expect(checkbox.hasAttribute("disabled")).toBe(false);
    fireEvent.click(checkbox);
    expect(onToggleRepeat).toHaveBeenCalledTimes(1);
  });

  test("Apply on key repeat is hidden without the capability", () => {
    const { container } = renderTabs({ selected: 1 });

    expect(container.querySelector(REPEAT_CHECKBOX)).toBeNull();
  });

  test("a repeat tab offers the checkbox without the capability, so the flag can be cleared", () => {
    const keyRules = [rules[0], { ...rules[1], previous: 0x9006 }];
    const { container, onToggleRepeat } = renderTabs({ keyRules, selected: 1 });
    const checkbox = container.querySelector(REPEAT_CHECKBOX);

    expect(checkbox.getAttribute("data-state")).toBe("checked");
    fireEvent.click(checkbox);
    expect(onToggleRepeat).toHaveBeenCalledTimes(1);
  });

  test("a repeat tab is checked and marked in its label", () => {
    const keyRules = [rules[0], { ...rules[1], previous: 0x9006 }];
    const { container } = renderTabs({ keyRules, selected: 1, allowRepeat: true });
    const tabs = screen.getAllByRole("tab");

    expect(container.querySelector(REPEAT_CHECKBOX).getAttribute("data-state")).toBe("checked");
    expect(tabs[2].textContent).toMatch(/\+C↻$/);
    expect(tabs[1].textContent).not.toContain("↻");
  });

  test("Apply on key repeat is disabled on a blocked default, like Change", () => {
    const { container } = renderTabs({ block: "autoshift", selected: 0, allowRepeat: true });

    expect(container.querySelector(REPEAT_CHECKBOX).hasAttribute("disabled")).toBe(true);
  });

  test("failed shows the notice and Reload instead of the tabs", () => {
    const { onReload } = renderTabs({ state: "failed" });

    expect(screen.getByText(strings.loadFailed)).not.toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: strings.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
