import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { HoldModsEntry } from "@Renderer/types/holdMods";
import { encodeHold, serializeHoldMods } from "../../../api/parsers/holdMods";
import { serializeAltRepeat } from "../../../api/parsers/altRepeat";
import { PerKeyOverride, serializePerKeyOverrides } from "../../../api/parsers/dualFunction";
import {
  LayoutRefs,
  applyMultiAction,
  prepareSuperkeyWrite,
  protectedSlots,
  reconcileDraft,
  superkeyRefs,
} from "../../../api/parsers/multiAction";
import { SuperkeyWriteFormat, serializeSuperkeyTable } from "../../../api/parsers/superkeys";
import {
  EMPTY_HOLD_SAVED,
  EMPTY_SUPERKEY_SAVED,
  HoldSavedState,
  LayoutSaveIO,
  LayoutSaveInput,
  SuperkeySaveInput,
  SuperkeySavedState,
  keymapSaveKey,
  protectedHoldCodes,
  runLayoutSave,
  usedHoldCodes,
  withHoldBaseline,
} from "./layoutSave";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

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

    const second = await runLayoutSave(
      failing.io,
      input({ layers, rules, table, saved: first.saved, savedRules: first.savedRules }),
    );

    expect(second.done).toEqual([]);
    expect(second.failed).toBe("rules");
    expect(second.saved.uncertainRules).toEqual([CAS_T_1]);
    expect(encodeHold(CAS_T, SHIFT, table, usedHoldCodes(layers, rules, second.saved, { layer: 0, position: 0 }))).toEqual({
      error: "slots",
    });

    const working = mockIO();
    const third = await runLayoutSave(
      working.io,
      input({ layers, rules, table, saved: second.saved, savedRules: second.savedRules }),
    );

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
      input({
        mode: "pending",
        layers: [[PARTIAL, PARTIAL_SLOT_1]],
        rules: [rule(PARTIAL)],
        table: [{ code: PARTIAL, held: GUI }],
      }),
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

/* ------------------------------------------------------------------------ */
/* Superkeys and per-key options                                            */
/* ------------------------------------------------------------------------ */

const SK = (slot: number) => 53980 + slot;
const A = 4;
const B = 5;
const LCTRL = 224;
// A tap and Ctrl hold, which the keyboard converts to a qukey in a keymap cell
const CTRL_A = [A, LCTRL, 1, 1, 1];
const CTRL_B = [B, LCTRL, 1, 1, 1];
// Five actions, so the keyboard runs it as a Superkey
const FULL_A = [A, LCTRL, B, 1, 1];
const FULL_B = [B, LCTRL, A, 1, 1];
const OVERRIDE: PerKeyOverride = {
  position: 3,
  holdTimeout: 300,
  quickTapTerm: null,
  priorInterval: null,
  mode: null,
  chordal: null,
  speculative: null,
  retro: null,
};

type FailOn = boolean | number;

const failsOn = (fail: FailOn | undefined, call: number) => fail === true || fail === call;

/* A keyboard with Superkeys and per-key options. A number fails only that call of the write, counted from 1 */
const mockSkIO = (fail: { holdMods?: FailOn; superkeys?: FailOn; keymap?: FailOn; rules?: FailOn; perKey?: FailOn } = {}) => {
  const writes: string[] = [];
  const calls = { holdMods: 0, superkeys: 0, keymap: 0, rules: 0, perKey: 0 };
  const io: LayoutSaveIO = {
    writeHoldMods: vi.fn(async (list: HoldModsEntry[]) => {
      calls.holdMods += 1;
      writes.push(`holdmods ${serializeHoldMods(list)}`);

      if (failsOn(fail.holdMods, calls.holdMods)) {
        throw new Error("holdmods.map write failed");
      }
    }),
    writeSuperkeys: vi.fn(async (table: number[][], format: SuperkeyWriteFormat) => {
      calls.superkeys += 1;
      writes.push(`superkeys ${JSON.stringify(table)}`);

      if (failsOn(fail.superkeys, calls.superkeys)) {
        throw new Error("superkeys.map write failed");
      }

      return format === "padded" ? table.length : null;
    }),
    writeKeymap: vi.fn(async (serialized: string, onlyCustom: boolean) => {
      calls.keymap += 1;
      writes.push(`keymap ${serialized}|${onlyCustom ? 1 : 0}`);

      if (failsOn(fail.keymap, calls.keymap)) {
        throw new Error("keymap.custom write failed");
      }
    }),
    writeRules: vi.fn(async (rules: AltRepeatRule[]) => {
      calls.rules += 1;
      writes.push(`rules ${serializeAltRepeat(rules)}`);

      if (failsOn(fail.rules, calls.rules)) {
        throw new Error("altrepeat.map read-back failed");
      }
    }),
    writePerKey: vi.fn(async (list: PerKeyOverride[]) => {
      calls.perKey += 1;
      writes.push(`perkey ${serializePerKeyOverrides(list)}`);

      if (failsOn(fail.perKey, calls.perKey)) {
        throw new Error("qukeys.perKey write failed");
      }
    }),
  };
  return { io, writes };
};

const slotsIn = (codes: number[]) =>
  [...new Set(codes.filter(code => code >= SK(0) && code < SK(128)).map(code => code - SK(0)))].sort();

/* The Superkey state after a load of a keyboard that holds `table`, `layers` and `rules` */
const skLoaded = (
  table: number[][],
  layers: number[][],
  format: SuperkeyWriteFormat = "padded",
  rules: AltRepeatRule[] = [],
): SuperkeySavedState => {
  const storedRows = format === "padded" ? table.length : null;
  return {
    ...EMPTY_SUPERKEY_SAVED,
    table: serializeSuperkeyTable(table, format, storedRows),
    storedRows,
    keymapRefs: slotsIn(layers.flat()),
    ruleRefs: slotsIn(rules.map(r => r.output)),
  };
};

const skInput = (
  table: number[][],
  layers: number[][],
  saved: SuperkeySavedState,
  extra: Partial<SuperkeySaveInput> = {},
): SuperkeySaveInput => ({
  mode: "ready",
  format: "padded",
  prepared: { table, layers },
  collect: false,
  draftRefs: { defaultLayers: [], layerOffset: 0, combos: [] },
  saved,
  ...extra,
});

/* A save of `layers` and `table` over a keyboard that holds `savedLayers` and `savedTable`, with no held modifiers */
const skSave = (
  table: number[][],
  layers: number[][],
  skSaved: SuperkeySavedState,
  savedLayers: number[][],
  extra: Partial<LayoutSaveInput> = {},
  skExtra: Partial<SuperkeySaveInput> = {},
): LayoutSaveInput =>
  input({ layers, saved: loaded(savedLayers), superkeys: skInput(table, layers, skSaved, skExtra), ...extra });

describe("runLayoutSave without the Superkey and per-key members (P18)", () => {
  test("the outcome has today's fields only and the new writes are never called", async () => {
    const { io, writes } = mockSkIO();

    const outcome = await runLayoutSave(io, input({ layers: [[SK(0)]], rules: [rule(SK(1))] }));

    expect(writes).toEqual([`keymap ${SK(0)}|1`, `rules 1 1 0 6 ${SK(1)}`]);
    expect(Object.keys(outcome).sort()).toEqual(["done", "error", "failed", "layers", "rules", "saved", "savedRules", "table"]);
    expect(io.writeSuperkeys).not.toHaveBeenCalled();
    expect(io.writePerKey).not.toHaveBeenCalled();
  });

  test("an IO without the new writers saves as today", async () => {
    const { io, writes } = mockIO();

    const outcome = await runLayoutSave(io, input({ layers: [[SK(0)]] }));

    expect(writes).toEqual([`keymap ${SK(0)}|1`]);
    expect(outcome.done).toEqual(["keymap"]);
  });

  test("a ready Superkey input without writeSuperkeys is refused before any write", async () => {
    const { io, writes } = mockIO();
    const layers = [[SK(0)]];

    await expect(runLayoutSave(io, skSave([FULL_A], layers, EMPTY_SUPERKEY_SAVED, [[PLAIN]]))).rejects.toThrow(
      "A Superkey save needs writeSuperkeys",
    );
    expect(writes).toEqual([]);
  });

  test("unsupported or failed Superkeys write no table, save the draft's layers and run no GC", async () => {
    for (const mode of ["unsupported", "failed"] as const) {
      const { io, writes } = mockSkIO();

      const outcome = await runLayoutSave(
        io,
        skSave(
          [],
          [[SK(0)]],
          EMPTY_SUPERKEY_SAVED,
          [[PLAIN]],
          {},
          { mode, collect: true, prepared: { table: [], layers: [[PLAIN]] } },
        ),
      );

      expect(writes).toEqual([`keymap ${SK(0)}|1`]);
      expect(outcome.done).toEqual(["keymap"]);
    }
  });
});

describe("runLayoutSave with Superkeys", () => {
  test("writes the table, Superkeys, keymap, rules, per-key options, unused entries, then unused Superkeys", async () => {
    const { io, writes } = mockSkIO();
    const table = [
      { code: PARTIAL, held: GUI },
      { code: CAS_T_0, held: CTRL },
    ];
    // The keyboard holds slot 0 on the key. The draft gives the key slot 1 and a rule slot 2
    const savedSk = skLoaded([FULL_A], [[SK(0)]]);
    const layers = [[SK(1), PARTIAL]];
    const rules = [rule(SK(2))];

    const outcome = await runLayoutSave(io, {
      ...skSave([FULL_A, FULL_B, CTRL_B], layers, savedSk, [[SK(0), PLAIN]], { rules, table }, { collect: true }),
      perKey: { list: [OVERRIDE], saved: "0" },
    });

    expect(writes).toEqual([
      `holdmods 2 ${CAS_T_0} ${CTRL} ${PARTIAL} ${GUI}`,
      `superkeys ${JSON.stringify([FULL_A, FULL_B, CTRL_B])}`,
      `keymap ${SK(1)} ${PARTIAL}|1`,
      `rules 1 1 0 6 ${SK(2)}`,
      `perkey 1 3 300 65535 255 3 3 3 3`,
      `holdmods 1 ${PARTIAL} ${GUI}`,
      `superkeys ${JSON.stringify([[1, 1, 1, 1, 1], FULL_B, CTRL_B])}`,
      `keymap ${SK(1)} ${PARTIAL}|1`,
    ]);
    expect(outcome.done).toEqual(["table", "superkeys", "keymap", "rules", "perKey", "gc", "skgc", "keymapAfterGc"]);
    expect(outcome.failed).toBeUndefined();
    expect(outcome.perKeySaved).toBe("1 3 300 65535 255 3 3 3 3");
    expect(outcome.superkeys).toEqual({
      table: [[1, 1, 1, 1, 1], FULL_B, CTRL_B],
      saved: {
        ...EMPTY_SUPERKEY_SAVED,
        table: serializeSuperkeyTable([[1, 1, 1, 1, 1], FULL_B, CTRL_B], "padded", 3),
        storedRows: 3,
        cleanupDone: true,
        keymapRefs: [1],
        ruleRefs: [2],
      },
    });
  });

  test("saves the prepared layers, with the merges, in ready mode", async () => {
    const { io, writes } = mockSkIO();
    const savedSk = skLoaded([CTRL_A, CTRL_A], [[SK(0), SK(1)]]);

    const outcome = await runLayoutSave(
      io,
      input({
        layers: [[SK(0), SK(1)]],
        saved: loaded([[SK(0), SK(1)]]),
        superkeys: skInput([CTRL_A, CTRL_A], [[SK(0), SK(0)]], savedSk),
      }),
    );

    expect(writes).toEqual([`keymap ${SK(0)} ${SK(0)}|1`]);
    expect(outcome.layers).toEqual([[SK(0), SK(0)]]);
    // Keep slot 1 until GC, since the keymap no longer uses it but GC is off
    expect(outcome.superkeys?.saved.keymapRefs).toEqual([0]);
    expect(outcome.superkeys?.table).toEqual([CTRL_A, CTRL_A]);
  });

  test("a Superkey edit with an unchanged keymap writes the keymap after it", async () => {
    const { io, writes } = mockSkIO();
    const layers = [[SK(0)]];

    const outcome = await runLayoutSave(io, skSave([FULL_B], layers, skLoaded([FULL_A], layers), layers));

    expect(writes).toEqual([`superkeys ${JSON.stringify([FULL_B])}`, `keymap ${SK(0)}|1`]);
    expect(outcome.done).toEqual(["superkeys", "keymap"]);
    expect(outcome.superkeys?.saved.keymapStale).toBe(false);
  });

  test("writes nothing when nothing changed", async () => {
    const { io, writes } = mockSkIO();
    const layers = [[SK(0)]];
    const savedSk = skLoaded([FULL_A], layers);

    const outcome = await runLayoutSave(io, skSave([FULL_A], layers, savedSk, layers, {}, { collect: true }));

    expect(writes).toEqual([]);
    expect(outcome.done).toEqual([]);
    expect(outcome.superkeys?.saved).toBe(savedSk);
  });

  test("a failed Superkey write stops before the keymap and forces both writes next time", async () => {
    const layers = [[SK(0)]];
    const failing = mockSkIO({ superkeys: true });

    const first = await runLayoutSave(failing.io, skSave([FULL_B], layers, skLoaded([FULL_A], layers), layers));

    expect(failing.writes).toEqual([`superkeys ${JSON.stringify([FULL_B])}`]);
    expect(first.failed).toBe("superkeys");
    expect(first.error).toEqual(new Error("superkeys.map write failed"));
    expect(first.superkeys?.saved).toEqual({
      ...skLoaded([FULL_A], layers),
      table: null,
      storedRows: null,
      keymapStale: true,
      cleanupDone: true,
    });

    // Go back to the old definition. The keyboard may hold either, so both are written again
    const working = mockSkIO();
    const retry = await runLayoutSave(working.io, skSave([FULL_A], layers, first.superkeys!.saved, layers));

    expect(working.writes).toEqual([`superkeys ${JSON.stringify([FULL_A])}`, `keymap ${SK(0)}|1`]);
    expect(retry.superkeys?.saved.keymapStale).toBe(false);
  });

  test("a failed keymap after a Superkey write keeps the keymap stale and its slots uncertain", async () => {
    const failing = mockSkIO({ keymap: true });

    const first = await runLayoutSave(failing.io, skSave([FULL_A, FULL_B], [[SK(1)]], skLoaded([FULL_A], [[SK(0)]]), [[SK(0)]]));

    expect(first.done).toEqual(["superkeys"]);
    expect(first.failed).toBe("keymap");
    expect(first.superkeys?.saved).toMatchObject({ keymapStale: true, keymapRefs: [0], uncertainKeymap: [1] });

    // The keymap write is forced also when the hold baseline matches the draft
    const working = mockSkIO();
    const retry = await runLayoutSave(working.io, skSave([FULL_A, FULL_B], [[SK(1)]], first.superkeys!.saved, [[SK(1)]]));

    expect(working.writes).toEqual([`keymap ${SK(1)}|1`]);
    expect(retry.superkeys?.saved).toMatchObject({ keymapStale: false, keymapRefs: [1], uncertainKeymap: [] });
  });

  test("keymap and rule uncertainty are kept apart (P11)", async () => {
    const table = [FULL_A, FULL_B, CTRL_B];
    const savedSk = skLoaded(table, [[SK(0)]]);

    // The rule to slot 2 fails after the keymap to slot 1 is saved
    const first = await runLayoutSave(
      mockSkIO({ rules: true }).io,
      skSave(table, [[SK(1)]], savedSk, [[SK(0)]], { rules: [rule(SK(2))] }),
    );

    expect(first.failed).toBe("rules");
    expect(first.superkeys?.saved).toMatchObject({ keymapRefs: [1], uncertainKeymap: [], ruleRefs: [], uncertainRules: [2] });

    // A failed keymap to slot 0 keeps the rule's uncertainty
    const second = await runLayoutSave(
      mockSkIO({ keymap: true }).io,
      input({
        layers: [[SK(0)]],
        rules: [],
        saved: first.saved,
        savedRules: first.savedRules,
        superkeys: skInput(table, [[SK(0)]], first.superkeys!.saved),
      }),
    );

    expect(second.failed).toBe("keymap");
    expect(second.superkeys?.saved).toMatchObject({ keymapRefs: [1], uncertainKeymap: [0], uncertainRules: [2] });

    // A saved keymap clears only the keymap's uncertainty
    const third = await runLayoutSave(
      mockSkIO({ rules: true }).io,
      input({
        layers: [[SK(0)]],
        rules: [],
        saved: second.saved,
        savedRules: second.savedRules,
        superkeys: skInput(table, [[SK(0)]], second.superkeys!.saved),
      }),
    );

    expect(third.failed).toBe("rules");
    expect(third.superkeys?.saved).toMatchObject({ keymapRefs: [0], uncertainKeymap: [], uncertainRules: [2] });
  });
});

describe("runLayoutSave per-key options", () => {
  test("a failed per-key write forgets the saved options and stops before the unused entries (P12)", async () => {
    const table = [
      { code: PARTIAL, held: GUI },
      { code: CAS_T_0, held: CTRL },
    ];
    const saved = { ...loaded([[PARTIAL]]), holdMods: serializeHoldMods(table) };
    const failing = mockSkIO({ perKey: true });

    const first = await runLayoutSave(
      failing.io,
      input({ layers: [[PARTIAL]], table, saved, perKey: { list: [OVERRIDE], saved: "0" } }),
    );

    expect(failing.writes).toEqual(["perkey 1 3 300 65535 255 3 3 3 3"]);
    expect(first.failed).toBe("perKey");
    expect(first.perKeySaved).toBeNull();

    // Back to no overrides, which the keyboard may not hold any more
    const working = mockSkIO();
    const retry = await runLayoutSave(
      working.io,
      input({ layers: [[PARTIAL]], table, saved, perKey: { list: [], saved: first.perKeySaved! } }),
    );

    expect(working.writes).toEqual(["perkey 0", `holdmods 1 ${PARTIAL} ${GUI}`]);
    expect(retry.perKeySaved).toBe("0");
  });

  test("unchanged options are not written", async () => {
    const { io, writes } = mockSkIO();

    const outcome = await runLayoutSave(io, input({ perKey: { list: [OVERRIDE], saved: serializePerKeyOverrides([OVERRIDE]) } }));

    expect(writes).toEqual([]);
    expect(outcome.perKeySaved).toBe(serializePerKeyOverrides([OVERRIDE]));
  });
});

describe("runLayoutSave Superkey GC", () => {
  // The keyboard holds slots 0 and 1 on two keys. The draft replaces slot 1 with a plain key
  const table = [FULL_A, FULL_B];
  const savedLayers = [[SK(0), SK(1)]];
  const layers = [[SK(0), PLAIN]];

  test("runs only with collect", async () => {
    const { io, writes } = mockSkIO();

    const outcome = await runLayoutSave(io, skSave(table, layers, skLoaded(table, savedLayers), savedLayers));

    expect(writes).toEqual([`keymap ${SK(0)} ${PLAIN}|1`]);
    expect(outcome.superkeys?.table).toBe(table);
  });

  test("drops the slot the saved keymap released, then writes the keymap again", async () => {
    const { io, writes } = mockSkIO();

    const outcome = await runLayoutSave(
      io,
      skSave(table, layers, skLoaded(table, savedLayers), savedLayers, {}, { collect: true }),
    );

    expect(writes).toEqual([`keymap ${SK(0)} ${PLAIN}|1`, `superkeys ${JSON.stringify([FULL_A])}`, `keymap ${SK(0)} ${PLAIN}|1`]);
    expect(outcome.done).toEqual(["keymap", "skgc", "keymapAfterGc"]);
    expect(outcome.superkeys).toEqual({
      table: [FULL_A],
      saved: {
        ...skLoaded([FULL_A], layers),
        table: serializeSuperkeyTable([FULL_A], "padded", 2),
        cleanupDone: true,
      },
    });
  });

  test("idles the slot in place on a legacy keyboard", async () => {
    const { io, writes } = mockSkIO();

    await runLayoutSave(
      io,
      skSave(table, layers, skLoaded(table, savedLayers, "legacy"), savedLayers, {}, { collect: true, format: "legacy" }),
    );

    expect(writes[1]).toBe(`superkeys ${JSON.stringify([FULL_A, [1, 1, 1, 1, 1]])}`);
  });

  test("keeps combo outputs, uncertain slots and default layers", async () => {
    const wide = [FULL_A, FULL_B, CTRL_A, CTRL_B, FULL_A];
    const savedSk = { ...skLoaded(wide, [[SK(0)]]), uncertainCombos: [3] };
    const { io, writes } = mockSkIO();

    await runLayoutSave(
      io,
      skSave(
        wide,
        [[SK(0)]],
        savedSk,
        [[SK(0)]],
        {},
        {
          collect: true,
          draftRefs: {
            defaultLayers: [[SK(2)]],
            layerOffset: 1,
            combos: [{ layer: 0, positions: [0, 1], action: SK(1) }],
          },
        },
      ),
    );

    // Slot 4 is the only one nothing references, so it is dropped from the end
    expect(writes).toEqual([`superkeys ${JSON.stringify([FULL_A, FULL_B, CTRL_A, CTRL_B])}`, `keymap ${SK(0)}|1`]);
  });

  test("keeps the slots of rules that are not loaded", async () => {
    const savedSk = skLoaded(table, [[SK(0)]], "padded", [rule(SK(1))]);
    const { io, writes } = mockSkIO();

    await runLayoutSave(
      io,
      skSave(table, [[SK(0)]], savedSk, [[SK(0)]], { rulesReady: false, rules: [], savedRules: null }, { collect: true }),
    );

    expect(writes).toEqual([]);
  });

  test("a failed GC write forgets the table and keeps the keymap stale", async () => {
    const { io } = mockSkIO({ superkeys: true });

    const outcome = await runLayoutSave(
      io,
      skSave(table, layers, skLoaded(table, savedLayers), savedLayers, {}, { collect: true }),
    );

    expect(outcome.done).toEqual(["keymap"]);
    expect(outcome.failed).toBe("skgc");
    expect(outcome.superkeys?.table).toBe(table);
    expect(outcome.superkeys?.saved).toMatchObject({ table: null, storedRows: null, keymapStale: true, keymapRefs: [0] });
  });

  test("a failed keymap write after GC leaves the keymap stale and its slots uncertain", async () => {
    const { io } = mockSkIO({ keymap: 2 });

    const outcome = await runLayoutSave(
      io,
      skSave(table, layers, skLoaded(table, savedLayers), savedLayers, {}, { collect: true }),
    );

    expect(outcome.done).toEqual(["keymap", "skgc"]);
    expect(outcome.failed).toBe("keymapAfterGc");
    expect(outcome.saved.keymap).toBeNull();
    expect(outcome.superkeys?.table).toEqual([FULL_A]);
    expect(outcome.superkeys?.saved).toMatchObject({ keymapStale: true, keymapRefs: [0], uncertainKeymap: [0] });
  });
});

describe("runLayoutSave merge, GC, edit and save without a reload (P5)", () => {
  test("the slot GC frees is reused by the next edit in the same session", async () => {
    // Two identical dual-function Superkeys on two keys, which the keyboard reads back as slot 0
    const savedLayers = [[SK(0), SK(1), PLAIN]];
    let skSaved = skLoaded([CTRL_A, CTRL_A], savedLayers);
    let holdSaved = loaded(savedLayers);
    let draftLayers = savedLayers;
    let table = [CTRL_A, CTRL_A];

    const prepared = prepareSuperkeyWrite({
      draft: { table, customLayers: draftLayers, defaultLayers: [], layerOffset: 0, rules: [], combos: [] },
      saved: skSaved,
      baseline: null,
      collect: true,
      format: "padded",
    });

    expect(prepared.layers).toEqual([[SK(0), SK(0), PLAIN]]);
    // Keep slot 1 in the first write, since the keyboard's keymap still uses it
    expect(prepared.table).toEqual([CTRL_A, CTRL_A]);

    const first = mockSkIO();
    const merged = await runLayoutSave(
      first.io,
      input({
        layers: draftLayers,
        saved: holdSaved,
        superkeys: skInput(prepared.table, prepared.layers, skSaved, { collect: true }),
      }),
    );

    expect(first.writes).toEqual([
      `keymap ${SK(0)} ${SK(0)} ${PLAIN}|1`,
      `superkeys ${JSON.stringify([CTRL_A])}`,
      `keymap ${SK(0)} ${SK(0)} ${PLAIN}|1`,
    ]);

    // Bring the saved cells into the draft and keep the saved table
    const changed = reconcileDraft(draftLayers, merged.layers);
    expect(changed).toEqual([{ layer: 0, position: 1, code: SK(0) }]);
    draftLayers = draftLayers.map((codes, l) =>
      codes.map((code, p) => changed.find(c => c.layer === l && c.position === p)?.code ?? code),
    );
    table = merged.superkeys!.table;
    skSaved = merged.superkeys!.saved;
    holdSaved = merged.saved;

    // Give the third key a new Superkey. Slot 1 is free again
    const refs: LayoutRefs = { customLayers: draftLayers, defaultLayers: [], layerOffset: 0, rules: [], combos: [] };
    const edit = applyMultiAction(
      { table, refs: superkeyRefs(refs), protectedSlots: protectedSlots(skSaved), currentCode: PLAIN },
      { kind: "cell", layer: 0, position: 2, custom: true },
      FULL_B,
    );

    expect(edit).toEqual({ table: [CTRL_A, FULL_B], code: SK(1) });

    if ("error" in edit) {
      return;
    }

    draftLayers = [[SK(0), SK(0), edit.code]];
    const next = prepareSuperkeyWrite({
      draft: { ...refs, customLayers: draftLayers, table: edit.table },
      saved: skSaved,
      baseline: null,
      collect: true,
      format: "padded",
    });
    const second = mockSkIO();
    const saved = await runLayoutSave(
      second.io,
      input({ layers: draftLayers, saved: holdSaved, superkeys: skInput(next.table, next.layers, skSaved, { collect: true }) }),
    );

    expect(second.writes).toEqual([`superkeys ${JSON.stringify([CTRL_A, FULL_B])}`, `keymap ${SK(0)} ${SK(0)} ${SK(1)}|1`]);
    expect(saved.superkeys?.saved).toMatchObject({ storedRows: 2, keymapRefs: [0, 1], keymapStale: false });
  });
});

describe("runLayoutSave stale-row clean-up (Q6)", () => {
  const layers = [[SK(0)]];

  test("a legacy save with an unchanged table writes no Superkeys, whatever the row count", async () => {
    for (const storedRows of [null, 5]) {
      const { io, writes } = mockSkIO();
      const savedSk = { ...skLoaded([FULL_A], layers, "legacy"), storedRows };

      await runLayoutSave(io, skSave([FULL_A], layers, savedSk, layers, {}, { format: "legacy" }));

      expect(writes).toEqual([]);
    }
  });

  test("a padded save with an unknown row count writes once per session, and a rescan allows it again", async () => {
    const loadedSk = { ...skLoaded([FULL_A], layers), storedRows: null as number | null };
    const first = mockSkIO();

    const once = await runLayoutSave(first.io, skSave([FULL_A], layers, loadedSk, layers));

    expect(first.writes).toEqual([`superkeys ${JSON.stringify([FULL_A])}`, `keymap ${SK(0)}|1`]);
    expect(once.superkeys?.saved).toMatchObject({ storedRows: 1, cleanupDone: true });

    // A reply that does not show the row count again keeps it unknown. The session's clean-up ran already
    const second = mockSkIO();
    await runLayoutSave(second.io, skSave([FULL_A], layers, { ...once.superkeys!.saved, storedRows: null }, layers));

    expect(second.writes).toEqual([]);

    // A rescan starts a new state with the clean-up not done
    const rescan = mockSkIO();
    await runLayoutSave(rescan.io, skSave([FULL_A], layers, loadedSk, layers));

    expect(rescan.writes).toEqual([`superkeys ${JSON.stringify([FULL_A])}`, `keymap ${SK(0)}|1`]);
  });

  test("a failed clean-up write counts as done", async () => {
    const loadedSk = { ...skLoaded([FULL_A], layers), storedRows: null as number | null };

    const outcome = await runLayoutSave(mockSkIO({ superkeys: true }).io, skSave([FULL_A], layers, loadedSk, layers));

    expect(outcome.failed).toBe("superkeys");
    expect(outcome.superkeys?.saved.cleanupDone).toBe(true);
  });

  test("a padded save clears stale rows behind an unchanged table", async () => {
    const { io, writes } = mockSkIO();
    // The keyboard counts three rows, the last two left by an old write
    const savedSk = { ...skLoaded([FULL_A], layers), storedRows: 3 };

    const outcome = await runLayoutSave(io, skSave([FULL_A], layers, savedSk, layers));

    expect(writes).toEqual([`superkeys ${JSON.stringify([FULL_A])}`, `keymap ${SK(0)}|1`]);
    expect(io.writeSuperkeys).toHaveBeenCalledWith([FULL_A], "padded", 3);
    expect(outcome.superkeys?.saved).toMatchObject({ storedRows: 1, table: serializeSuperkeyTable([FULL_A], "padded", 3) });
  });
});
