import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import Light from "@Renderer/theme/LightTheme";
import MultiActionTab, { MultiActionProps, multiActionStatus, wheelSwitchesTab } from "./MultiActionTab";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const A = 4;
const B = 5;
const LEFT_GUI = 0xe3;

const renderTab = (props: Partial<MultiActionProps> = {}) => {
  const onChange = vi.fn();
  const renderPicker = vi.fn((slot: number, onSelect: (code: number) => void) => (
    <button type="button" onClick={() => onSelect(B)}>
      {`pick B for action ${slot}`}
    </button>
  ));

  render(
    <ThemeProvider theme={Light}>
      <MultiActionTab
        mode="full"
        context="cell"
        actions={[A, 1, 1, 1, 1]}
        storage="plain"
        slot={null}
        users={[]}
        capacity={{ used: 12, max: 70 }}
        actionLabel={code => `key ${code}`}
        onChange={onChange}
        renderPicker={renderPicker}
        {...props}
      />
    </ThemeProvider>,
  );

  return { onChange, renderPicker };
};

const tile = (index: number) => screen.getByTestId(`multiAction-tile-${index}`);

describe("multiActionStatus", () => {
  const base = {
    context: "cell" as const,
    slot: null as number | null,
    capacity: { used: 1, max: 70 },
    actions: [A, 1, 1, 1, 1],
  };

  test.each([
    ["dualUse" as const, null, "Saved as a dual-function key. Uses no Superkey slot."],
    ["superkey" as const, 11, "Saved as Superkey 12 (uses 1 of 70 slots)."],
    ["plain" as const, null, "Only a tap: saved as a normal key."],
  ])("a %s cell says how it is saved", (storage, slot, expected) => {
    expect(multiActionStatus({ ...base, storage, slot })).toBe(expected);
  });

  test("a cell with nothing set has no status", () => {
    expect(multiActionStatus({ ...base, storage: "plain", actions: [1, 1, 1, 1, 1] })).toBe("");
  });

  test("a combo result always uses a Superkey slot", () => {
    expect(multiActionStatus({ ...base, context: "combo", storage: "superkey", slot: 3 })).toBe(
      "Combo results and previous-key tabs always use a Superkey slot. Saved as Superkey 4 (uses 1 of 70 slots).",
    );
  });
});

describe("MultiActionTab", () => {
  afterEach(() => {
    cleanup();
  });

  test("an only-tap key shows its tap, empty tiles and the hint", () => {
    renderTab();

    expect(within(tile(0)).getByRole("button", { name: "Tap: key 4" })).not.toBeNull();
    expect([1, 2, 3, 4].map(index => within(tile(index)).getByRole("button").textContent)).toEqual([
      "Empty",
      "Empty",
      "Empty",
      "Empty",
    ]);
    expect(screen.getByText("Only a tap: saved as a normal key.")).not.toBeNull();
    expect(screen.getByText(/Add a Hold, Tap & hold, Double tap or Double tap & hold action/)).not.toBeNull();
  });

  test("a tile opens a nested picker for its action, and a pick sets that action", () => {
    const { onChange, renderPicker } = renderTab();

    fireEvent.click(within(tile(2)).getByRole("button"));
    fireEvent.click(screen.getByRole("button", { name: "pick B for action 2" }));

    expect(renderPicker).toHaveBeenCalledWith(2, expect.any(Function));
    expect(onChange).toHaveBeenCalledWith([A, 1, B, 1, 1]);
  });

  test("the clear button idles a set action", () => {
    const { onChange } = renderTab({ actions: [A, LEFT_GUI, 1, 1, 1], storage: "dualUse" });

    fireEvent.click(screen.getByRole("button", { name: "Clear Hold" }));

    expect(onChange).toHaveBeenCalledWith([A, 1, 1, 1, 1]);
  });

  test("a shared Superkey names every user", () => {
    renderTab({
      actions: [A, 1, B, 1, 1],
      storage: "superkey",
      slot: 11,
      users: ["Layer 1 key 12", "Layer 2 key 12", "Combo 4"],
    });

    expect(screen.getByText("Shared by 3: Layer 1 key 12, Layer 2 key 12, Combo 4. Changes apply to all.")).not.toBeNull();
    expect(screen.getByText("Saved as Superkey 12 (uses 1 of 70 slots).")).not.toBeNull();
  });

  test("a Superkey only this key uses has no shared chip", () => {
    renderTab({ actions: [A, 1, B, 1, 1], storage: "superkey", slot: 11, users: ["Layer 1 key 12"] });

    expect(screen.queryByText(/Shared by/)).toBeNull();
  });

  test("the capacity meter shows the used share of the 70 slots in full mode", () => {
    renderTab();

    expect(screen.getByText("Superkeys Memory Usage")).not.toBeNull();
    // 12 of 70 slots
    expect(screen.getByText("17.1%")).not.toBeNull();
  });

  test("dualUseOnly shows only Tap and Hold and no capacity meter", () => {
    renderTab({ mode: "dualUseOnly" });

    expect(screen.queryByTestId("multiAction-tile-2")).toBeNull();
    expect(screen.getByText(/This keyboard has no Superkeys/)).not.toBeNull();
    expect(screen.queryByText("Superkeys Memory Usage")).toBeNull();
  });

  test("disabledReason makes the tab read-only and says why", () => {
    const { onChange } = renderTab({
      actions: [A, LEFT_GUI, 1, 1, 1],
      disabledReason: "The Superkeys could not be read. Reload to edit multi-action keys.",
    });

    expect(screen.getByRole("alert").textContent).toBe("The Superkeys could not be read. Reload to edit multi-action keys.");
    expect(
      within(tile(1))
        .getAllByRole("button")
        .map(button => (button as HTMLButtonElement).disabled),
    ).toEqual([true]);

    fireEvent.click(within(tile(1)).getByRole("button"));

    expect(onChange).not.toHaveBeenCalled();
  });

  test("the notice for a Superkey beyond the limit shows", () => {
    renderTab({
      actions: [A, LEFT_GUI, 1, 1, 1],
      storage: "superkey",
      notice: "Superkey 76 is beyond the keyboard's limit of 70. Editing gives this key its own Superkey.",
    });

    expect(
      screen.getByText("Superkey 76 is beyond the keyboard's limit of 70. Editing gives this key its own Superkey."),
    ).not.toBeNull();
  });
});

describe("wheelSwitchesTab", () => {
  afterEach(() => {
    cleanup();
  });

  test("a wheel event switches the tab while no action picker is open", () => {
    renderTab();

    expect(wheelSwitchesTab(tile(0), document)).toBe(true);
  });

  test("a wheel event leaves the tab while an action picker is open", () => {
    renderTab();

    fireEvent.click(within(tile(2)).getByRole("button"));
    const picked = screen.getByRole("button", { name: "pick B for action 2" });

    expect(wheelSwitchesTab(picked, document)).toBe(false);
    expect(wheelSwitchesTab(tile(0), document)).toBe(false);
  });

  test("a wheel event in a select list leaves the tab", () => {
    const list = document.createElement("div");
    list.innerHTML = '<div role="option">A</div>';
    document.body.appendChild(list);

    expect(wheelSwitchesTab(list.firstElementChild, document)).toBe(false);
    list.remove();
  });
});
