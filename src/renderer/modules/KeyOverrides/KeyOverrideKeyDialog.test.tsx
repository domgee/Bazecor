import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@Renderer/i18n";
import { KeymapDB } from "../../../api/keymap";
import KeyOverrideKeyDialog, { KeyOverrideKeyMode } from "./KeyOverrideKeyDialog";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

/* Stand in for the on-screen keyboard, whose module graph vitest cannot load, and emit a base key */
vi.mock("@Renderer/modules/KeyPickerKeyboard", () => ({
  Picker: ({ onKeySelect }: { onKeySelect: (code: number) => void }) => (
    <button type="button" onClick={() => onKeySelect(0x2a)}>
      pick backspace
    </button>
  ),
}));

const strings = i18n.editor.keyOverrides;

const renderDialog = (mode: KeyOverrideKeyMode, initialCode: number) => {
  const onConfirm = vi.fn();
  render(
    <KeyOverrideKeyDialog
      open
      mode={mode}
      initialCode={initialCode}
      keymapDB={new KeymapDB()}
      selectedlanguage="en-US"
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
  return { onConfirm };
};

const confirmButton = () => screen.getByRole("button", { name: strings.confirm });

describe("KeyOverrideKeyDialog", () => {
  afterEach(() => {
    cleanup();
  });

  test("a trigger offers no AltGr and uses its own ids", () => {
    renderDialog("trigger", 0x2a);

    expect(document.querySelector("#input-koTrigger-addModAltGr-radio")).toBeNull();
    expect(document.querySelector("#input-koTrigger-addModAlt-radio")).not.toBeNull();
    expect(screen.queryByRole("button", { name: strings.blockButton })).toBeNull();
  });

  test("a replacement offers AltGr and uses its own ids", () => {
    renderDialog("replacement", 0x2a);

    expect(document.querySelector("#input-koReplacement-addModAltGr-radio")).not.toBeNull();
  });

  test.each<[KeyOverrideKeyMode]>([["trigger"], ["replacement"]])("a %s can not be a modifier alone", mode => {
    renderDialog(mode, 0xe1);

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(mode === "trigger" ? strings.triggerInvalid : strings.replacementInvalid)).not.toBeNull();
  });

  test("nothing picked yet can not be confirmed", () => {
    renderDialog("trigger", 0);

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
  });

  test("Shift+Backspace confirms 2090", () => {
    const { onConfirm } = renderDialog("trigger", 2090);

    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(2090);
  });

  test("picking Backspace, then Shift, confirms 2090 as a replacement", () => {
    const { onConfirm } = renderDialog("replacement", 0);

    fireEvent.click(screen.getByRole("button", { name: "pick backspace" }));
    fireEvent.click(document.querySelector("#input-koReplacement-addModShift-radio"));
    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(2090);
  });

  test("a trigger with AltGr is confirmed with Alt, as the firmware matches it", () => {
    const { onConfirm } = renderDialog("trigger", 0x42a);

    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(0x22a);
  });

  test("Block confirms 0", () => {
    const { onConfirm } = renderDialog("replacement", 0x2a);

    fireEvent.click(screen.getByRole("button", { name: strings.blockButton }));

    expect(onConfirm).toHaveBeenCalledWith(0);
  });
});
