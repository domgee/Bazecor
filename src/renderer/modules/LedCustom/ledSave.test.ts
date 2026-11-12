import { describe, expect, test, vi } from "vitest";
import { emptyLedTable } from "../../../api/parsers/ledCustom";
import { EMPTY_LED_SAVED, collectLedSlots, loadLedTable, protectedLedSlots, withLedBaseline } from "./ledSave";

const red = { type: 1, r: 255, g: 0, b: 0, speed: 0 };
const off = { type: 6, r: 0, g: 0, b: 0, speed: 0 };

describe("loadLedTable", () => {
  test("reads nothing when help does not list the table", async () => {
    const device = { noCacheCommand: vi.fn() };

    expect(await loadLedTable(device, false)).toEqual({ state: "unsupported", table: emptyLedTable() });
    expect(device.noCacheCommand).not.toHaveBeenCalled();
  });

  test("gives the table, or failed for a reply that is no table", async () => {
    const good = { noCacheCommand: vi.fn(async () => "1 6 0 0 0 0") };
    const bad = { noCacheCommand: vi.fn(async () => "error") };

    expect(await loadLedTable(good, true)).toEqual({ state: "ready", table: [off, ...emptyLedTable().slice(1)] });
    expect(await loadLedTable(bad, true)).toEqual({ state: "failed", table: emptyLedTable() });
  });
});

describe("withLedBaseline", () => {
  test("protects the slots the keymap, rules and combos use", () => {
    const saved = withLedBaseline([red, off, ...emptyLedTable().slice(2)], {
      layers: [[17155, 4]],
      rules: [{ output: 17157 }],
      combos: [{ action: 17160 }],
    });

    expect(saved).toEqual({ ...EMPTY_LED_SAVED, table: "2 1 255 0 0 0 6 0 0 0 0", keymapRefs: [0], ruleRefs: [2], comboRefs: [5] });
    expect(protectedLedSlots({ ...saved, uncertainCombos: [7] })).toEqual(new Set([0, 2, 5, 7]));
  });
});

describe("collectLedSlots", () => {
  test("frees the slots neither the draft nor the keyboard uses", () => {
    const table = [red, off, red, ...emptyLedTable().slice(3)];
    const saved = { ...EMPTY_LED_SAVED, uncertainKeymap: [2] };

    expect(collectLedSlots(table, { layers: [[17155]] }, saved)).toEqual([red, ...emptyLedTable().slice(1, 2), red, ...emptyLedTable().slice(3)]);
  });
});
