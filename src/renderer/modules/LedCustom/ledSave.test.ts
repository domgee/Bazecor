import { describe, expect, test, vi } from "vitest";
import { emptyLedTable } from "../../../api/parsers/ledCustom";
import { serializeCombos } from "../../../api/parsers/combos";
import { serializeAltRepeat } from "../../../api/parsers/altRepeat";
import {
  EMPTY_LED_SAVED,
  collectLedSlots,
  keyboardLedSources,
  ledSavedAfterWrites,
  ledSlotsKnown,
  loadLedTable,
  protectedLedSlots,
  withLedBaseline,
} from "./ledSave";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

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

describe("keyboardLedSources", () => {
  test("reads the combo and rule outputs the keyboard holds from their serialized forms", () => {
    const combo = { id: 0, name: "", positions: [0, 1, 255, 255, 255, 255], layer: 0, flags: 1, action: 17157 };
    const rule = { layer: 1, position: 2, previous: 4, output: 17160 };

    const sources = keyboardLedSources(serializeCombos([combo]), serializeAltRepeat([rule]));

    expect([sources.combos.map(each => each.action), sources.rules.map(each => each.output)]).toEqual([[17157], [17160]]);
  });

  test("gives nothing for unknown forms", () => {
    expect(keyboardLedSources(null, null)).toEqual({ combos: [], rules: [] });
  });
});

describe("ledSlotsKnown", () => {
  const known = { table: "ready" as const, keymap: true, combos: true, rules: true };

  test("hands out slots only when the table and every reference are known", () => {
    expect(ledSlotsKnown(known)).toBe(true);
  });

  test.each([
    ["the table failed", { table: "failed" as const }],
    ["the keymap is unknown", { keymap: false }],
    ["a failed combos write left the combos unknown", { combos: false }],
    ["a failed rules write left the rules unknown", { rules: false }],
  ])("hands out none when %s", (_, change) => {
    expect(ledSlotsKnown({ ...known, ...change })).toBe(false);
  });
});

describe("ledSavedAfterWrites", () => {
  const before = { ...EMPTY_LED_SAVED, table: "1 6 0 0 0 0", keymapRefs: [0], ruleRefs: [3], uncertainKeymap: [1], uncertainRules: [4] };

  test("takes the rule slots of a rules write that landed and clears their uncertainty", () => {
    const after = ledSavedAfterWrites(before, { done: ["rules"], layers: [[17155]], rules: [{ output: 17161 }] }, []);

    expect(after).toEqual({ ...before, ruleRefs: [6], uncertainRules: [] });
  });

  test("takes the keymap slots of a keymap write that landed, default layers included", () => {
    const after = ledSavedAfterWrites(before, { done: ["keymap"], layers: [[17157]], rules: [] }, [[17156]]);

    expect(after).toEqual({ ...before, keymapRefs: [1, 2], uncertainKeymap: [] });
  });

  test("keeps everything when neither write landed", () => {
    expect(ledSavedAfterWrites(before, { done: ["table"], layers: [], rules: [] }, [])).toBe(before);
  });
});
