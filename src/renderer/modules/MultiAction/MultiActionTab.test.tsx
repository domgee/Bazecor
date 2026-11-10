import React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ThemeProvider } from "styled-components";
import Light from "@Renderer/theme/LightTheme";
import { emptyOverride } from "@Renderer/modules/DualFunctionKeys/overrideTable";
import MultiActionTab, {
  MultiActionPerKey,
  MultiActionProps,
  hasCustomTiming,
  multiActionStatus,
  wheelSwitchesTab,
} from "./MultiActionTab";

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

const POSITION = 14;

const perKeyProps = (props: Partial<MultiActionPerKey> = {}): MultiActionPerKey => ({
  override: emptyOverride(POSITION),
  stored: emptyOverride(POSITION),
  keyData: undefined,
  role: "dualFunction",
  globals: { holdTimeout: 250, quickTapTerm: null, priorInterval: 75, options: null },
  disabled: false,
  onChange: vi.fn(),
  onClear: vi.fn(),
  ...props,
});

const openTiming = () => fireEvent.click(screen.getByRole("button", { name: /Timing for this key position/ }));

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

  test("a tap-only previous-key tab says it is saved as a normal key", () => {
    expect(multiActionStatus({ ...base, context: "rule", storage: "plain" })).toBe("Only a tap: saved as a normal key.");
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

describe("per-position options", () => {
  afterEach(() => {
    cleanup();
  });

  test("a cell shows the options collapsed, and opening them shows the note and the options", () => {
    renderTab({ perKey: perKeyProps() });

    expect(screen.getByRole("button", { name: /Timing for this key position/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Hold timeout")).toBeNull();

    openTiming();

    expect(screen.getByText("Applies to this physical key on every layer.")).not.toBeNull();
    expect(screen.queryByText("These options belong to the physical key, not to this previous-key tab.")).toBeNull();
    expect(screen.getByText("Hold timeout")).not.toBeNull();
    expect(screen.getByText("Use global (250 ms)")).not.toBeNull();
  });

  test("a previous-key tab also says the options belong to the physical key", () => {
    renderTab({ context: "rule", perKey: perKeyProps() });

    openTiming();

    expect(screen.getByText("Applies to this physical key on every layer.")).not.toBeNull();
    expect(screen.getByText("These options belong to the physical key, not to this previous-key tab.")).not.toBeNull();
  });

  test("a combo result has no per-position options", () => {
    renderTab({ context: "combo", perKey: perKeyProps() });

    expect(screen.queryByRole("button", { name: /Timing for this key position/ })).toBeNull();
  });

  test("a key without per-position options has no section", () => {
    renderTab();

    expect(screen.queryByRole("button", { name: /Timing for this key position/ })).toBeNull();
  });

  test("the options show also for a key that is not dual-function", () => {
    renderTab({ perKey: perKeyProps({ role: "other" }) });

    openTiming();

    expect(screen.getByText(/this is not a dual-function key/)).not.toBeNull();
    expect(screen.getByText("Hold timeout")).not.toBeNull();
  });

  test("a key position with its own options shows the custom timing chip, and reset clears them", () => {
    const onClear = vi.fn();
    renderTab({ perKey: perKeyProps({ override: { ...emptyOverride(POSITION), mode: 1 }, onClear }) });

    expect(screen.getByText("custom timing")).not.toBeNull();

    openTiming();
    fireEvent.click(screen.getByRole("button", { name: "Use global for all" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("a key position on the global options has no chip and nothing to reset", () => {
    renderTab({ perKey: perKeyProps() });

    expect(screen.queryByText("custom timing")).toBeNull();

    openTiming();

    expect((screen.getByRole("button", { name: "Use global for all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("a turned-off Superkey part leaves the per-position options editable", () => {
    const onClear = vi.fn();
    renderTab({
      disabledReason: "The Superkeys could not be read. Reload to edit multi-action keys.",
      perKey: perKeyProps({ override: { ...emptyOverride(POSITION), retro: true }, onClear }),
    });

    openTiming();
    fireEvent.click(screen.getByRole("button", { name: "Use global for all" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test("unreadable options are read-only and say why", () => {
    renderTab({
      perKey: perKeyProps({
        override: { ...emptyOverride(POSITION), mode: 1 },
        disabledReason: "The dual-function options of the key positions could not be read. Reload to edit them.",
      }),
    });

    openTiming();

    expect(screen.getByRole("alert").textContent).toBe(
      "The dual-function options of the key positions could not be read. Reload to edit them.",
    );
    expect((screen.getByRole("button", { name: "Use global for all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("options turned off during a save can not be reset", () => {
    renderTab({ perKey: perKeyProps({ override: { ...emptyOverride(POSITION), mode: 1 }, disabled: true }) });

    openTiming();

    expect((screen.getByRole("button", { name: "Use global for all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("hasCustomTiming is true only for a key position with options of its own", () => {
    expect(hasCustomTiming(undefined)).toBe(false);
    expect(hasCustomTiming(perKeyProps())).toBe(false);
    expect(hasCustomTiming(perKeyProps({ override: { ...emptyOverride(POSITION), holdTimeout: 300 } }))).toBe(true);
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
