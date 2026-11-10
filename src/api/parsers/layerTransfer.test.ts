import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import {
  cloneLayerSuperkeys,
  exportSuperkeys,
  fileSuperkeySource,
  hasSuperkeyRef,
  layerFileSource,
  remapLayoutSuperkeys,
  resolveLayerCopy,
  ruleOutputFromDefault,
  transferUsed,
} from "./layerTransfer";
import { LayoutRefs } from "./multiAction";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const SK = (slot: number) => 53980 + slot;
const IDLE = [1, 1, 1, 1, 1];
const A = 4;
const B = 5;
const CTRL = 224;
const TAP_HOLD = [A, CTRL, 1, 1, 1];
const DOUBLE = [A, 1, 1, B, 1];

const rule = (layer: number, position: number, output: number): AltRepeatRule => ({ layer, position, previous: B, output });

const refs = (partial: Partial<LayoutRefs>): LayoutRefs => ({
  customLayers: [],
  defaultLayers: [],
  layerOffset: 0,
  rules: [],
  combos: [],
  ...partial,
});

describe("transferUsed", () => {
  test("Draft refs, protected and held slots_All used", () => {
    const used = transferUsed(
      refs({ customLayers: [[SK(2)]], rules: [rule(0, 1, SK(5))] }),
      { keymapRefs: [7], uncertainRules: [9] },
      [11],
    );

    expect([...used].sort((a, b) => a - b)).toEqual([2, 5, 7, 9, 11]);
  });
});

describe("hasSuperkeyRef", () => {
  test("Superkey code present_True", () => {
    expect(hasSuperkeyRef([A, SK(3)])).toBe(true);
    expect(hasSuperkeyRef([A, B])).toBe(false);
  });
});

describe("exportSuperkeys", () => {
  test("Referenced slots_Exported once each, without idle, undefined or beyond-limit slots", () => {
    const table = [TAP_HOLD, IDLE, DOUBLE];

    expect(exportSuperkeys([SK(2), A, SK(0), SK(2), SK(1), SK(9), SK(75)], table)).toEqual([
      { code: SK(0), actions: TAP_HOLD },
      { code: SK(2), actions: DOUBLE },
    ]);
  });
});

describe("fileSuperkeySource", () => {
  test("Code entries_Read by slot", () => {
    const source = fileSuperkeySource([
      { code: SK(4), actions: DOUBLE },
      { code: SK(1), actions: [A, CTRL] },
    ]);

    expect(source?.[4]).toEqual(DOUBLE);
    expect(source?.[1]).toEqual(TAP_HOLD);
    expect(source?.[0]).toBeUndefined();
  });

  test("Old table entries_Read by index", () => {
    const source = fileSuperkeySource([{ actions: TAP_HOLD, name: "x", id: 0 }, { actions: DOUBLE }]);

    expect(source?.[0]).toEqual(TAP_HOLD);
    expect(source?.[1]).toEqual(DOUBLE);
  });

  test("Slots at or above 70 and invalid entries_Undefined", () => {
    const source = fileSuperkeySource([
      { code: SK(70), actions: DOUBLE },
      { code: A, actions: DOUBLE },
      { code: SK(2), actions: ["x"] },
      { code: SK(3), actions: [1, 2, 3, 4, 5, 6] },
      null,
    ]);

    expect(source?.filter(entry => entry !== undefined)).toEqual([]);
  });

  test("No array_Null", () => {
    expect(fileSuperkeySource(undefined)).toBeNull();
    expect(fileSuperkeySource({})).toBeNull();
  });
});

describe("layerFileSource", () => {
  const current = [DOUBLE];

  test("File with Superkeys_File definitions", () => {
    expect(layerFileSource([{ code: SK(0), actions: TAP_HOLD }], true, current)?.[0]).toEqual(TAP_HOLD);
  });

  test("Old file for the same product_Keyboard definitions", () => {
    expect(layerFileSource(undefined, true, current)).toBe(current);
  });

  test("Old file for another product_No definitions", () => {
    expect(layerFileSource(undefined, false, current)).toEqual([]);
  });
});

describe("cloneLayerSuperkeys", () => {
  test("Copied layer and rules_Each occurrence gets its own slot", () => {
    const table = [TAP_HOLD, DOUBLE];

    const result = cloneLayerSuperkeys({
      cells: [[SK(1), A, SK(1), SK(0)]],
      rules: [rule(2, 3, SK(1)), rule(2, 4, B)],
      sourceTable: table,
      table,
      used: new Set([0, 1, 3]),
    });

    expect(result).toEqual({
      cells: [[SK(2), A, SK(4), SK(5)]],
      rules: [rule(2, 3, SK(6)), rule(2, 4, B)],
      table: [TAP_HOLD, DOUBLE, DOUBLE, IDLE, DOUBLE, TAP_HOLD, DOUBLE],
      missing: 0,
    });
  });

  test("Held slot_Never taken", () => {
    const table = [DOUBLE];
    // Slot 1 is idle in the draft, but the keyboard still holds a definition there
    const result = cloneLayerSuperkeys({ cells: [[SK(0)]], rules: [], sourceTable: table, table, used: new Set([0, 1]) });

    expect(result).toEqual({ cells: [[SK(2)]], rules: [], table: [DOUBLE, IDLE, DOUBLE], missing: 0 });
  });

  test("Missing definitions_Cells become No Key and rules are dropped", () => {
    const result = cloneLayerSuperkeys({
      cells: [[SK(0), SK(75)]],
      rules: [rule(1, 2, SK(3)), rule(1, 3, A)],
      sourceTable: [],
      table: [],
      used: new Set(),
    });

    expect(result).toEqual({ cells: [[0, 0]], rules: [rule(1, 3, A)], table: [], missing: 3 });
  });

  test("Not enough free slots_Capacity and nothing changed", () => {
    const table = [DOUBLE];
    const used = new Set(Array.from({ length: 69 }, (_, slot) => slot));

    const result = cloneLayerSuperkeys({ cells: [[SK(0), SK(0)]], rules: [], sourceTable: table, table, used });

    expect(result).toEqual({ error: "capacity" });
  });

  test("Old file without Superkeys for the same product_Keyboard definitions cloned", () => {
    const table = [TAP_HOLD];

    const result = cloneLayerSuperkeys({
      cells: [[SK(0)]],
      rules: [],
      sourceTable: layerFileSource(undefined, true, table),
      table,
      used: new Set([0]),
    });

    expect(result).toEqual({ cells: [[SK(1)]], rules: [], table: [TAP_HOLD, TAP_HOLD], missing: 0 });
  });
});

describe("remapLayoutSuperkeys", () => {
  test("Full import_Shared file slots stay shared in one new slot each", () => {
    const fileTable = fileSuperkeySource([{ actions: TAP_HOLD }, { actions: DOUBLE }]) ?? [];
    const table = [DOUBLE];

    const result = remapLayoutSuperkeys({
      cells: [
        [SK(1), SK(0)],
        [SK(1), A],
      ],
      rules: [rule(0, 1, SK(1)), rule(0, 2, SK(4))],
      fileTable,
      table,
      used: new Set([0, 2]),
    });

    expect(result).toEqual({
      cells: [
        [SK(1), SK(3)],
        [SK(1), A],
      ],
      rules: [rule(0, 1, SK(1))],
      table: [DOUBLE, DOUBLE, IDLE, TAP_HOLD],
      missing: 1,
      defaultSplit: 0,
    });
  });

  test("Not enough free slots_Capacity", () => {
    const fileTable = [DOUBLE, TAP_HOLD];
    const used = new Set(Array.from({ length: 69 }, (_, slot) => slot));

    expect(remapLayoutSuperkeys({ cells: [[SK(0), SK(1)]], rules: [], fileTable, table: [], used })).toEqual({
      error: "capacity",
    });
  });
});

describe("remapLayoutSuperkeys with default layers", () => {
  // Default layers are never written, so the keyboard's default layers keep their own Superkeys
  test("File default shares a slot whose definition the keyboard holds there_Custom key keeps that slot", () => {
    const fileTable = [TAP_HOLD, DOUBLE];
    const table = [TAP_HOLD];

    const result = remapLayoutSuperkeys({
      cells: [[SK(0), SK(1)]],
      rules: [],
      fileTable,
      table,
      used: new Set([0]),
      fileDefaults: [[SK(0)]],
      keyboardDefaults: [[SK(0)]],
    });

    expect(result).toEqual({ cells: [[SK(0), SK(1)]], rules: [], table: [TAP_HOLD, DOUBLE], missing: 0, defaultSplit: 0 });
  });

  test("File default shares a slot the keyboard defines differently_Custom key gets its own slot with a warning", () => {
    const fileTable = [DOUBLE];
    const table = [TAP_HOLD];

    const result = remapLayoutSuperkeys({
      cells: [[SK(0)]],
      rules: [rule(0, 1, SK(0))],
      fileTable,
      table,
      used: new Set(),
      fileDefaults: [[SK(0)]],
      keyboardDefaults: [[SK(0)]],
    });

    expect(result).toEqual({
      cells: [[SK(1)]],
      rules: [rule(0, 1, SK(1))],
      table: [TAP_HOLD, DOUBLE],
      missing: 0,
      defaultSplit: 1,
    });
  });

  test("Keyboard default slot not in the used set_Never taken", () => {
    const result = remapLayoutSuperkeys({
      cells: [[SK(0)]],
      rules: [],
      fileTable: [DOUBLE],
      table: [],
      used: new Set(),
      keyboardDefaults: [[A, SK(0)]],
    });

    expect(result).toEqual({ cells: [[SK(1)]], rules: [], table: [IDLE, DOUBLE], missing: 0, defaultSplit: 0 });
  });
});

describe("resolveLayerCopy", () => {
  // Two default and two custom layers. The dialog ids and the current layer count the default layers first
  test.each([
    [0, 3, { source: { kind: "default", index: 0 }, target: 1, sourceColors: 1 }], // default 1 onto custom 2
    [2, 3, { source: { kind: "custom", index: 0 }, target: 1, sourceColors: 0 }], // custom 1 onto custom 2
    [3, 2, { source: { kind: "custom", index: 1 }, target: 0, sourceColors: 1 }], // custom 2 onto custom 1
  ])("Without only custom, id %i onto layer %i_Custom-relative indexes", (layer, currentLayer, expected) => {
    expect(resolveLayerCopy({ layer, currentLayer, onlyCustom: false, defaultCount: 2 })).toEqual(expected);
  });

  test.each([
    [-2, 1, { source: { kind: "default", index: 0 }, target: 1, sourceColors: 1 }], // default 1 onto custom 2
    [0, 1, { source: { kind: "custom", index: 0 }, target: 1, sourceColors: 0 }], // custom 1 onto custom 2
  ])("Only custom, id %i onto layer %i_Custom-relative indexes", (layer, currentLayer, expected) => {
    expect(resolveLayerCopy({ layer, currentLayer, onlyCustom: true, defaultCount: 2 })).toEqual(expected);
  });
});

describe("ruleOutputFromDefault", () => {
  test("Plain allowed default_Kept", () => {
    const table = [DOUBLE];

    expect(ruleOutputFromDefault(B, table, new Set())).toEqual({ output: B, table, fallback: null });
  });

  test("Default not allowed as an output_Starts from A", () => {
    // A dual-function code can't be a previous-key output
    expect(ruleOutputFromDefault(49169 + A, [], new Set()).output).toBe(A);
  });

  test("Superkey default_Cloned into a new slot", () => {
    const table = [DOUBLE];

    expect(ruleOutputFromDefault(SK(0), table, new Set([0, 1]))).toEqual({
      output: SK(2),
      table: [DOUBLE, IDLE, DOUBLE],
      fallback: null,
    });
  });

  test("No free slot_Starts from the Tap", () => {
    const table = [[B, 1, 1, A, 1]];
    const used = new Set(Array.from({ length: 70 }, (_, slot) => slot));

    expect(ruleOutputFromDefault(SK(0), table, used)).toEqual({ output: B, table, fallback: "capacity" });
  });

  test("No free slot and no Tap_Starts from A", () => {
    const table = [[1, CTRL, 1, 1, 1]];
    const used = new Set(Array.from({ length: 70 }, (_, slot) => slot));

    expect(ruleOutputFromDefault(SK(0), table, used)).toEqual({ output: A, table, fallback: "capacity" });
  });

  test("Superkeys not usable_Starts from the Tap", () => {
    const table = [[B, 1, 1, A, 1]];

    expect(ruleOutputFromDefault(SK(0), table, null)).toEqual({ output: B, table, fallback: "blocked" });
  });

  test("Superkeys unreadable_Starts from A with the blocked notice", () => {
    // A failed read leaves the table empty, so the default's definition is unknown
    expect(ruleOutputFromDefault(SK(0), [], null)).toEqual({ output: A, table: [], fallback: "blocked" });
  });

  test("Undefined Superkey default_Starts from A without a notice", () => {
    expect(ruleOutputFromDefault(SK(3), [DOUBLE], new Set())).toEqual({ output: A, table: [DOUBLE], fallback: null });
  });
});
