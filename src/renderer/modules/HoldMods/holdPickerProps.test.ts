import { describe, expect, test, vi } from "vitest";
import { HoldModsState } from "@Renderer/types/holdMods";
import { HoldPickerInput, holdPickerProps } from "./holdPickerProps";

const onHoldChange = vi.fn(() => true);

const props = (overrides: Partial<HoldPickerInput>) =>
  holdPickerProps({
    context: "cell",
    layer: 2,
    altRepeatLayerHold: true,
    state: "ready",
    settled: true,
    heldMask: 16,
    onHoldChange,
    ...overrides,
  });

describe("holdPickerProps", () => {
  test.each([["cell"], ["rule"]] as ["cell" | "rule"][])("a settled %s gets the row and no checkbox", context => {
    expect(props({ context })).toEqual({ allowLayerHold: false, holdMods: { heldMask: 16, onHoldChange } });
  });

  test.each([["cell"], ["rule"]] as ["cell" | "rule"][])("a %s on firmware without the table gets the checkbox", context => {
    expect(props({ context, state: "unsupported", settled: false })).toEqual({ allowLayerHold: true });
  });

  test.each([
    ["loading", false], // Loading, also an unreadable help
    ["failed", false], // The table could not be read
    ["ready", false], // The rules are not loaded yet
  ] as [HoldModsState, boolean][])("%s with settled %s gets no hold controls", (state, settled) => {
    expect(props({ state, settled })).toEqual({ allowLayerHold: false });
  });

  test.each([
    [{ layer: 0 }], // The default layer
    [{ layer: 0, state: "unsupported" as HoldModsState, settled: false }], // The default layer without the table
    [{ context: "rule" as const, altRepeatLayerHold: false }], // Rules on firmware that plays no hold as output
    [{ context: "rule" as const, altRepeatLayerHold: false, state: "unsupported" as HoldModsState, settled: false }],
  ])("%j gets no hold controls", overrides => {
    expect(props(overrides)).toEqual({ allowLayerHold: false });
  });
});
