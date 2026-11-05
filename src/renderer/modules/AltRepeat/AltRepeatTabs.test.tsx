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
}) => {
  const handlers = { onSelect: vi.fn(), onAdd: vi.fn(), onChangePrevious: vi.fn(), onDelete: vi.fn(), onReload: vi.fn() };
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
    />,
  );
  return { container, ...handlers };
};

const addButton = () => screen.getByRole("button", { name: strings.add });

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

  test("failed shows the notice and Reload instead of the tabs", () => {
    const { onReload } = renderTabs({ state: "failed" });

    expect(screen.getByText(strings.loadFailed)).not.toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: strings.reload }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
