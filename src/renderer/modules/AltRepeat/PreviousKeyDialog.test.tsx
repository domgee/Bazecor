import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { i18n } from "@Renderer/i18n";
import { KeymapDB } from "../../../api/keymap";
import PreviousKeyDialog from "./PreviousKeyDialog";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

/* Stand in for the on-screen keyboard, whose module graph vitest cannot load. Its only job here is to emit a base key */
vi.mock("@Renderer/modules/KeyPickerKeyboard", () => ({
  Picker: ({ onKeySelect }: { onKeySelect: (code: number) => void }) => (
    <button type="button" onClick={() => onKeySelect(6)}>
      pick c
    </button>
  ),
}));

const strings = i18n.editor.altRepeat;

const renderDialog = (initialCode: number, takenCodes: number[] = []) => {
  const onConfirm = vi.fn();
  render(
    <PreviousKeyDialog
      open
      initialCode={initialCode}
      takenCodes={takenCodes}
      keymapDB={new KeymapDB()}
      selectedlanguage="en-US"
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );
  return { onConfirm };
};

const confirmButton = () => screen.getByRole("button", { name: strings.confirm });

describe("PreviousKeyDialog", () => {
  afterEach(() => {
    cleanup();
  });

  test("offers no AltGr", () => {
    renderDialog(6);

    expect(document.querySelector("#input-addModAltGr-radio")).toBeNull();
    expect(document.querySelector("#input-addModAlt-radio")).not.toBeNull();
  });

  test("a modifier alone cannot be confirmed", () => {
    renderDialog(224);

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(strings.previousModifierOnly)).not.toBeNull();
  });

  test("a previous key another tab has cannot be confirmed", () => {
    renderDialog(0x106, [0x106]);

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(strings.previousDuplicate)).not.toBeNull();
  });

  test("nothing picked yet cannot be confirmed", () => {
    renderDialog(0);

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
  });

  test("picking c, then Ctrl, confirms 0x106", () => {
    const { onConfirm } = renderDialog(0);

    fireEvent.click(screen.getByRole("button", { name: "pick c" }));
    fireEvent.click(document.querySelector("#input-addModControl-radio"));
    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledWith(0x106);
  });
});
