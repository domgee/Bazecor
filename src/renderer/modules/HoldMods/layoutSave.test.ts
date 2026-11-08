import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { HoldModsEntry } from "@Renderer/types/holdMods";
import { encodeHold, serializeHoldMods } from "../../../api/parsers/holdMods";
import { serializeAltRepeat } from "../../../api/parsers/altRepeat";
import {
  EMPTY_HOLD_SAVED,
  HoldSavedState,
  LayoutSaveInput,
  keymapSaveKey,
  protectedHoldCodes,
  runLayoutSave,
  usedHoldCodes,
  withHoldBaseline,
} from "./layoutSave";

// Cmd+Shift+Tab in slot 0 and slot 1, and its plain form
const PARTIAL = 0x982b;
const PARTIAL_SLOT_1 = 0xb82b;
const PLAIN = 0x182b;
// Ctrl+Alt+Shift+T in slot 0 and slot 1, which has six choices of held modifiers
const CAS_T = 0x0b17;
const CAS_T_0 = 0x8b17;
const CAS_T_1 = 0xab17;
const CTRL = 1;
const ALT = 2;
const SHIFT = 8;
const GUI = 16;

const rule = (output: number, position = 0): AltRepeatRule => ({ layer: 1, position, previous: 6, output });

/* A keyboard whose writes fail on demand. Record each write in order */
const mockIO = (fail: { holdMods?: boolean; keymap?: boolean; rules?: boolean } = {}) => {
  const writes: string[] = [];
  const io = {
    writeHoldMods: vi.fn(async (list: HoldModsEntry[]) => {
      writes.push(`holdmods ${serializeHoldMods(list)}`);

      if (fail.holdMods) {
        throw new Error("holdmods.map write failed");
      }
    }),
    writeKeymap: vi.fn(async (serialized: string, onlyCustom: boolean) => {
      writes.push(`keymap ${serialized}|${onlyCustom ? 1 : 0}`);

      if (fail.keymap) {
        throw new Error("keymap.custom write failed");
      }
    }),
    writeRules: vi.fn(async (rules: AltRepeatRule[]) => {
      writes.push(`rules ${serializeAltRepeat(rules)}`);

      if (fail.rules) {
        throw new Error("altrepeat.map read-back failed");
      }
    }),
  };
  return { io, writes };
};

/* The state after a load of a keyboard with `layers` and `rules` saved and an empty table */
const loaded = (layers: number[][], rules: AltRepeatRule[] = []): HoldSavedState =>
  withHoldBaseline([], { keymap: keymapSaveKey(layers.flat(), true), keymapCodes: layers.flat(), ruleRefs: rules });

const input = (overrides: Partial<LayoutSaveInput>): LayoutSaveInput => ({
  mode: "settled",
  layers: [[PLAIN]],
  rules: [],
  rulesReady: true,
  onlyCustom: true,
  table: [],
  saved: loaded([[PLAIN]]),
  savedRules: "0",
  ...overrides,
});

describe("runLayoutSave order", () => {
  test("writes the table, the keymap, the rules, then drops unused entries", async () => {
    const { io, writes } = mockIO();
    const table = [
      { code: PARTIAL, held: GUI },
      { code: CAS_T_0, held: CTRL },
    ];

    const outcome = await runLayoutSave(io, input({ layers: [[PARTIAL]], rules: [rule(PARTIAL)], table }));

    // The table is sent sorted by code
    expect(writes).toEqual([
      `holdmods 2 ${CAS_T_0} ${CTRL} ${PARTIAL} ${GUI}`,
      `keymap ${PARTIAL}|1`,
      `rules 1 1 0 6 ${PARTIAL}`,
      `holdmods 1 ${PARTIAL} ${GUI}`,
    ]);
    expect(outcome.done).toEqual(["table", "keymap", "rules", "gc"]);
    expect(outcome.failed).toBeUndefined();
    expect(outcome.table).toEqual([{ code: PARTIAL, held: GUI }]);
    expect(outcome.saved).toEqual({
      holdMods: `1 ${PARTIAL} ${GUI}`,
      keymap: `${PARTIAL}|1`,
      keymapCodes: [PARTIAL],
      ruleRefs: [rule(PARTIAL)],
      uncertainKeymap: [],
      uncertainRules: [],
    });
    expect(outcome.savedRules).toBe(`1 1 0 6 ${PARTIAL}`);
  });

  test("writes nothing when nothing changed", async () => {
    const { io, writes } = mockIO();
    const table = [{ code: PARTIAL, held: GUI }];
    const saved = { ...loaded([[PARTIAL]]), holdMods: serializeHoldMods(table) };

    const outcome = await runLayoutSave(io, input({ layers: [[PARTIAL]], table, saved }));

    expect(writes).toEqual([]);
    expect(outcome.done).toEqual([]);
    expect(outcome.saved).toBe(saved);
  });

  test("a failed table write stops before the keymap and forces the next table write", async () => {
    const { io, writes } = mockIO({ holdMods: true });
    const table = [{ code: PARTIAL, held: GUI }];

    const outcome = await runLayoutSave(io, input({ layers: [[PARTIAL]], table }));

    expect(writes).toEqual([`holdmods 1 ${PARTIAL} ${GUI}`]);
    expect(outcome.done).toEqual([]);
    expect(outcome.failed).toBe("table");
    expect(outcome.error).toEqual(new Error("holdmods.map write failed"));
    expect(outcome.saved.holdMods).toBeNull();
  });

  test("a failed unused-entries write keeps the full table in the draft and forces the next table write", async () => {
    const { io } = mockIO({ holdMods: true });
    const table = [
      { code: PARTIAL, held: GUI },
      { code: CAS_T_0, held: CTRL },
    ];
    const saved = { ...loaded([[PLAIN]]), holdMods: serializeHoldMods(table) };

    const outcome = await runLayoutSave(io, input({ layers: [[PARTIAL]], table, saved }));

    expect(outcome.done).toEqual(["keymap"]);
    expect(outcome.failed).toBe("gc");
    expect(outcome.table).toBe(table);
    expect(outcome.saved.holdMods).toBeNull();
  });
});

describe("runLayoutSave after a failed keymap write", () => {
  test("the keymap codes become uncertain and a retry writes the keymap again", async () => {
    const table = [{ code: PARTIAL, held: GUI }];
    const failing = mockIO({ keymap: true });

    const first = await runLayoutSave(failing.io, input({ layers: [[PARTIAL]], table }));

    expect(first.done).toEqual(["table"]);
    expect(first.failed).toBe("keymap");
    expect(first.saved).toEqual({
      ...loaded([[PLAIN]]),
      holdMods: `1 ${PARTIAL} ${GUI}`,
      keymap: null,
      uncertainKeymap: [PARTIAL],
    });
    // Keep the slot of the code the keyboard may hold, though the draft no longer uses it
    expect(protectedHoldCodes(first.saved)).toEqual(new Set([PARTIAL]));

    const working = mockIO();
    const retry = await runLayoutSave(working.io, input({ layers: [[PARTIAL]], table, saved: first.saved }));

    expect(working.writes).toEqual([`keymap ${PARTIAL}|1`]);
    expect(retry.done).toEqual(["keymap"]);
    expect(retry.saved).toEqual({
      ...loaded([[PARTIAL]]),
      holdMods: `1 ${PARTIAL} ${GUI}`,
    });
  });
});

describe("runLayoutSave keymap skip", () => {
  test("an unchanged keymap is not sent", async () => {
    const { io } = mockIO();

    await runLayoutSave(io, input({ saved: loaded([[PLAIN]]) }));

    expect(io.writeKeymap).not.toHaveBeenCalled();
  });

  test("a keymap is sent after a failed keymap step, also when it is back to the saved one", async () => {
    const { io } = mockIO();
    const saved = { ...loaded([[PLAIN]]), keymap: null as string | null };

    await runLayoutSave(io, input({ saved }));

    expect(io.writeKeymap).toHaveBeenCalledWith(String(PLAIN), true);
  });

  test("a changed onlyCustom is sent", async () => {
    const { io } = mockIO();

    await runLayoutSave(io, input({ onlyCustom: false }));

    expect(io.writeKeymap).toHaveBeenCalledWith(String(PLAIN), false);
  });
});

describe("runLayoutSave after a failed rules write", () => {
  test("the keymap is saved, the rule codes stay protected until a rules write succeeds", async () => {
    // A key in slot 0 holding Ctrl and a rule in slot 1 holding Alt, on a keyboard with neither
    let table = [
      { code: CAS_T_0, held: CTRL },
      { code: CAS_T_1, held: ALT },
    ];
    let rules = [rule(CAS_T_1)];
    const layers = [[CAS_T_0]];
    const failing = mockIO({ rules: true });

    const first = await runLayoutSave(failing.io, input({ layers, rules, table }));

    expect(first.done).toEqual(["table", "keymap"]);
    expect(first.failed).toBe("rules");
    expect(first.saved.keymapCodes).toEqual([CAS_T_0]);
    expect(first.saved.uncertainRules).toEqual([CAS_T_1]);
    expect(first.savedRules).toBeNull();

    // Delete the rule and give the key Shift. Slot 0 is saved and slot 1 may be on the keyboard
    rules = [];
    const used = usedHoldCodes(layers, rules, first.saved, { layer: 0, position: 0 });

    expect(encodeHold(CAS_T, SHIFT, table, used)).toEqual({ error: "slots" });

    const second = await runLayoutSave(failing.io, input({ layers, rules, table, saved: first.saved, savedRules: first.savedRules }));

    expect(second.done).toEqual([]);
    expect(second.failed).toBe("rules");
    expect(second.saved.uncertainRules).toEqual([CAS_T_1]);
    expect(encodeHold(CAS_T, SHIFT, table, usedHoldCodes(layers, rules, second.saved, { layer: 0, position: 0 }))).toEqual({
      error: "slots",
    });

    const working = mockIO();
    const third = await runLayoutSave(working.io, input({ layers, rules, table, saved: second.saved, savedRules: second.savedRules }));

    expect(working.writes).toEqual([`rules 0`, `holdmods 1 ${CAS_T_0} ${CTRL}`]);
    expect(third.done).toEqual(["rules", "gc"]);
    expect(third.saved.uncertainRules).toEqual([]);
    table = third.table;

    expect(encodeHold(CAS_T, SHIFT, table, usedHoldCodes(layers, rules, third.saved, { layer: 0, position: 0 }))).toEqual({
      code: CAS_T_1,
      table: [
        { code: CAS_T_0, held: CTRL },
        { code: CAS_T_1, held: SHIFT },
      ],
    });
  });

  test("rules whose read-back failed are written again after the draft goes back to the old rules", async () => {
    const failing = mockIO({ rules: true });

    const first = await runLayoutSave(failing.io, input({ rules: [rule(PLAIN)] }));

    expect(first.savedRules).toBeNull();

    const working = mockIO();
    await runLayoutSave(working.io, input({ rules: [], saved: first.saved, savedRules: first.savedRules }));

    expect(working.writes).toEqual(["rules 0"]);
  });
});

describe("runLayoutSave import over a saved choice", () => {
  test("an imported code keeps the keyboard's meaning of the saved code when the keymap write fails", async () => {
    // The keyboard's layer 0 uses slot 0 holding Shift. An import of that layer brings slot 0 holding Cmd
    const savedTable = [{ code: PARTIAL, held: SHIFT }];
    const saved = { ...loaded([[PARTIAL]]), holdMods: serializeHoldMods(savedTable) };
    const imported = encodeHold(PLAIN, GUI, savedTable, usedHoldCodes([], [], saved));

    expect(imported).toEqual({
      code: PARTIAL_SLOT_1,
      table: [
        { code: PARTIAL, held: SHIFT },
        { code: PARTIAL_SLOT_1, held: GUI },
      ],
    });

    const { io, writes } = mockIO({ keymap: true });
    const table = "table" in imported ? imported.table : [];
    const outcome = await runLayoutSave(io, input({ layers: [[PARTIAL_SLOT_1]], table, saved }));

    expect(outcome.failed).toBe("keymap");
    expect(writes[0]).toBe(`holdmods 2 ${PARTIAL} ${SHIFT} ${PARTIAL_SLOT_1} ${GUI}`);
    expect(protectedHoldCodes(outcome.saved)).toEqual(new Set([PARTIAL, PARTIAL_SLOT_1]));
  });
});

describe("runLayoutSave modes", () => {
  test("pending writes no table and sends the codes unchanged", async () => {
    const { io, writes } = mockIO();

    const outcome = await runLayoutSave(
      io,
      input({ mode: "pending", layers: [[PARTIAL, PARTIAL_SLOT_1]], rules: [rule(PARTIAL)], table: [{ code: PARTIAL, held: GUI }] }),
    );

    expect(writes).toEqual([`keymap ${PARTIAL} ${PARTIAL_SLOT_1}|1`, `rules 1 1 0 6 ${PARTIAL}`]);
    expect(outcome.layers).toEqual([[PARTIAL, PARTIAL_SLOT_1]]);
    expect(io.writeHoldMods).not.toHaveBeenCalled();
  });

  test("settled makes orphan codes plain", async () => {
    const { io, writes } = mockIO();

    const outcome = await runLayoutSave(
      io,
      input({ layers: [[PARTIAL_SLOT_1]], rules: [rule(PARTIAL_SLOT_1)], saved: loaded([[PARTIAL_SLOT_1]]) }),
    );

    expect(writes).toEqual([`keymap ${PLAIN}|1`, `rules 1 1 0 6 ${PLAIN}`]);
    expect(outcome.layers).toEqual([[PLAIN]]);
    expect(outcome.rules).toEqual([rule(PLAIN)]);
  });

  test("unsupported makes every partial code plain and writes no table", async () => {
    const { io, writes } = mockIO();

    const outcome = await runLayoutSave(
      io,
      input({
        mode: "unsupported",
        saved: EMPTY_HOLD_SAVED,
        layers: [[PARTIAL, 0x382b]],
        rules: [rule(PARTIAL_SLOT_1)],
        table: [{ code: PARTIAL, held: GUI }],
      }),
    );

    expect(writes).toEqual([`keymap ${PLAIN} ${0x382b}|1`, `rules 1 1 0 6 ${PLAIN}`]);
    expect(outcome.layers).toEqual([[PLAIN, 0x382b]]);
    expect(outcome.rules).toEqual([rule(PLAIN)]);
  });

  test("rules that are not loaded are not written and their protections stay", async () => {
    const { io } = mockIO();
    const saved = { ...loaded([[PLAIN]], [rule(PARTIAL)]), uncertainRules: [PARTIAL_SLOT_1] };

    const outcome = await runLayoutSave(io, input({ mode: "pending", rulesReady: false, rules: [], saved, savedRules: null }));

    expect(io.writeRules).not.toHaveBeenCalled();
    expect(protectedHoldCodes(outcome.saved)).toEqual(new Set([PARTIAL, PARTIAL_SLOT_1]));
  });
});
