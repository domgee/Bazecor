import { describe, expect, test, vi } from "vitest";
import { COMBO_POSITION_UNUSED, ComboType, MAX_COMBO_MEMBERS } from "@Renderer/types/combos";
import { SuperkeyDraft } from "../../../api/parsers/multiAction";
import { serializeCombos } from "../../../api/parsers/combos";
import { SuperkeyWriteFormat, serializeSuperkeyTable } from "../../../api/parsers/superkeys";
import { EMPTY_SUPERKEY_SAVED, SuperkeySavedState } from "../HoldMods/layoutSave";
import { LedCustomSlot, emptyLedTable, serializeLedCustom } from "../../../api/parsers/ledCustom";
import { EMPTY_LED_SAVED, withLedBaseline } from "../LedCustom/ledSave";
import {
  ComboLedInput,
  ComboSaveInput,
  ComboSuperkeyInput,
  loadKeymapReplies,
  readKeymapReplies,
  refSlotsOf,
  runComboSave,
} from "./comboSave";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const SK = (slot: number) => 53980 + slot;
const IDLE = [1, 1, 1, 1, 1];
const A = 4;
const B = 5;
const CTRL = 224;
// Ctrl+A and Shift+A taps with a Ctrl hold share one qukey code, so a keymap cell of either plays the lower slot
const CTRL_A = [0x104, CTRL, 1, 1, 1];
const SHIFT_A = [0x804, CTRL, 1, 1, 1];
// Five actions, so the firmware runs it as a Superkey
const FULL_B = [B, CTRL, A, 1, 1];

const combo = (index: number, action: number): ComboType => {
  const positions = new Array<number>(MAX_COMBO_MEMBERS).fill(COMBO_POSITION_UNUSED);
  positions[0] = index * 2;
  positions[1] = index * 2 + 1;
  return { id: index, name: `C${index}`, positions, layer: 0, flags: 1, action };
};

type Fail = { superkeys?: boolean; keymap?: boolean; combos?: boolean; backup?: boolean; previews?: string };

/* A keyboard whose writes fail on demand. Record each step in order */
const mockIO = (fail: Fail = {}) => {
  const steps: string[] = [];
  const io = {
    writeSuperkeys: vi.fn(async (table: number[][], format: SuperkeyWriteFormat, storedRows: number | null) => {
      steps.push(`superkeys ${serializeSuperkeyTable(table, format, storedRows)}`);

      if (fail.superkeys) {
        throw new Error("superkeys.map read-back failed");
      }

      return format === "padded" ? table.length : storedRows;
    }),
    writeKeymap: vi.fn(async (serialized: string, onlyCustom: boolean) => {
      steps.push(`keymap ${serialized}|${onlyCustom ? 1 : 0}`);

      if (fail.keymap) {
        throw new Error("keymap.custom write failed");
      }
    }),
    writeCombos: vi.fn(async (serialized: string) => {
      steps.push(`combos ${serialized.split(" ")[0]}`);

      if (fail.combos) {
        throw new Error("combos.map write failed");
      }
    }),
    storeNames: vi.fn((combos: ComboType[], table: number[][] | null) => {
      steps.push(`names ${combos.length} ${table === null ? "-" : table.length}`);
    }),
    unreadableBeforeBackup: vi.fn(async () => {
      steps.push("previews");
      return fail.previews ?? null;
    }),
    backup: vi.fn(async () => {
      steps.push("backup");

      if (fail.backup) {
        throw new Error("backup failed");
      }
    }),
  };
  return { io, steps };
};

const draftOf = (table: number[][], customLayers: number[][], combos: ComboType[]): SuperkeyDraft => ({
  table,
  customLayers,
  defaultLayers: [],
  layerOffset: 0,
  rules: [],
  combos,
});

/* The saved state after a load of `table` with these references, in the padded format with a known row count */
const savedOf = (table: number[][], customLayers: number[][], combos: ComboType[]): SuperkeySavedState => ({
  ...EMPTY_SUPERKEY_SAVED,
  table: serializeSuperkeyTable(table, "padded", table.length),
  storedRows: table.length,
  keymapRefs: refSlotsOf({ customLayers }),
  comboRefs: refSlotsOf({ combos }),
});

const superkeysInput = (
  overrides: Partial<ComboSuperkeyInput> & Pick<ComboSuperkeyInput, "draft" | "saved">,
): ComboSuperkeyInput => ({
  format: "padded",
  baseline: null,
  onlyCustom: true,
  collect: false,
  ...overrides,
});

const input = (overrides: Partial<ComboSaveInput>): ComboSaveInput => ({
  combos: [],
  savedCombos: serializeCombos([]),
  rereadBeforeBackup: false,
  isVirtual: false,
  ...overrides,
});

describe("runComboSave order", () => {
  test("a new Superkey result writes superkeys.map, the keymap, combos.map, the names and the backup", async () => {
    const { io, steps } = mockIO();
    const layers = [[SK(0), A]];
    const loadedCombos = [combo(0, B)];
    const combos = [combo(0, SK(1))];
    const saved = savedOf([CTRL_A], layers, loadedCombos);

    const outcome = await runComboSave(
      io,
      input({
        combos,
        savedCombos: serializeCombos(loadedCombos),
        superkeys: superkeysInput({ draft: draftOf([CTRL_A, FULL_B], layers, combos), saved }),
      }),
    );

    expect(steps).toEqual([
      `superkeys ${serializeSuperkeyTable([CTRL_A, FULL_B], "padded", 1)}`,
      `keymap ${SK(0)} ${A}|1`,
      "combos 1",
      "names 1 2",
      "backup",
    ]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["superkeys", "keymap", "combos", "backup"], warnings: [] });
    expect(outcome.kind !== "blocked" && outcome.savedCombos).toBe(serializeCombos(combos));
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved).toEqual({
      ...saved,
      table: serializeSuperkeyTable([CTRL_A, FULL_B], "padded", 1),
      storedRows: 2,
      keymapStale: false,
      cleanupDone: true,
      keymapRefs: [0],
      comboRefs: [1],
    });
  });

  test("a plain result change writes only combos.map and backs up", async () => {
    const { io, steps } = mockIO();
    const layers = [[SK(0)]];
    const combos = [combo(0, A)];
    const saved = savedOf([CTRL_A], layers, []);

    const outcome = await runComboSave(
      io,
      input({ combos, superkeys: superkeysInput({ draft: draftOf([CTRL_A], layers, combos), saved }) }),
    );

    expect(steps).toEqual(["combos 1", "names 1 1", "backup"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["combos", "backup"] });
  });

  test("a stale keymap from an earlier failed save is written although the table is unchanged", async () => {
    const { io, steps } = mockIO();
    const layers = [[SK(0)]];
    const saved = { ...savedOf([CTRL_A], layers, []), keymapStale: true, uncertainKeymap: [0] };

    const outcome = await runComboSave(io, input({ superkeys: superkeysInput({ draft: draftOf([CTRL_A], layers, []), saved }) }));

    expect(steps).toEqual([`keymap ${SK(0)}|1`, "names 0 1", "backup"]);
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved).toMatchObject({ keymapStale: false, uncertainKeymap: [] });
  });

  test("without a Superkey input only combos.map is written", async () => {
    const { io, steps } = mockIO();
    const combos = [combo(0, SK(3))];

    const outcome = await runComboSave(io, input({ combos }));

    expect(steps).toEqual(["combos 1", "names 1 -", "backup"]);
    expect(outcome.kind !== "blocked" && outcome.superkeys).toBeUndefined();
  });
});

describe("runComboSave stale-row clean-up (Q6)", () => {
  test("a legacy save with an unchanged table and an unknown row count writes no Superkeys", async () => {
    const { io, steps } = mockIO();
    const saved: SuperkeySavedState = {
      ...savedOf([FULL_B], [], []),
      table: serializeSuperkeyTable([FULL_B], "legacy", null),
      storedRows: null,
    };

    await runComboSave(io, input({ superkeys: superkeysInput({ format: "legacy", draft: draftOf([FULL_B], [], []), saved }) }));

    expect(steps).toEqual(["names 0 1", "backup"]);
  });

  test("a padded save with an unknown row count writes once per session", async () => {
    const { io, steps } = mockIO();
    const saved: SuperkeySavedState = { ...savedOf([FULL_B], [], []), storedRows: null };
    const draft = draftOf([FULL_B], [], []);

    const first = await runComboSave(io, input({ superkeys: superkeysInput({ draft, saved }) }));
    const next = first.kind !== "blocked" ? first.superkeys?.saved : undefined;

    expect(next).toMatchObject({ storedRows: 1, cleanupDone: true, keymapStale: false });

    steps.length = 0;
    await runComboSave(
      io,
      input({
        superkeys: superkeysInput({ draft, saved: { ...(next as SuperkeySavedState), storedRows: null } }),
      }),
    );

    expect(steps).toEqual(["names 0 1", "backup"]);
  });
});

describe("runComboSave conflicts", () => {
  test("a new clash between a combo result and a keymap Superkey blocks before any write", async () => {
    const { io, steps } = mockIO();
    const layers = [[SK(1)]];
    const combos = [combo(0, SK(0))];

    const outcome = await runComboSave(
      io,
      input({
        combos,
        superkeys: superkeysInput({
          draft: draftOf([SHIFT_A, CTRL_A], layers, combos),
          saved: savedOf([IDLE, CTRL_A], layers, []),
          baseline: draftOf([IDLE, CTRL_A], layers, []),
        }),
      }),
    );

    expect(steps).toEqual([]);
    expect(outcome.kind).toBe("blocked");
    expect(outcome.kind === "blocked" && outcome.conflicts.map(conflict => conflict.members.map(member => member.slot))).toEqual([
      [0, 1],
    ]);
  });

  test("a clash already on the keyboard warns and saves", async () => {
    const { io, steps } = mockIO();
    const layers = [[SK(1)]];
    const loaded = [combo(0, SK(0))];
    const combos = [combo(0, SK(0)), combo(1, A)];
    const table = [SHIFT_A, CTRL_A];

    const outcome = await runComboSave(
      io,
      input({
        combos,
        savedCombos: serializeCombos(loaded),
        superkeys: superkeysInput({
          draft: draftOf(table, layers, combos),
          saved: savedOf(table, layers, loaded),
          baseline: draftOf(table, layers, loaded),
        }),
      }),
    );

    expect(steps).toEqual(["combos 2", "names 2 2", "backup"]);
    expect(outcome.kind).toBe("saved");
    expect(outcome.kind !== "blocked" && outcome.warnings).toHaveLength(1);
  });
});

describe("runComboSave by Superkey mode", () => {
  // A new clash between a combo result and a keymap Superkey
  const layers = [[SK(1)]];
  const combos = [combo(0, SK(0))];

  const save = (io: ReturnType<typeof mockIO>["io"], mode: ComboSuperkeyInput["mode"]) =>
    runComboSave(
      io,
      input({
        combos,
        superkeys: superkeysInput({
          draft: draftOf([SHIFT_A, CTRL_A], layers, combos),
          saved: savedOf([IDLE, CTRL_A], layers, []),
          baseline: draftOf([IDLE, CTRL_A], layers, []),
          mode,
        }),
      }),
    );

  test("a clash saves on unique firmware", async () => {
    const outcome = await save(mockIO().io, "unique");

    expect(outcome).toMatchObject({ kind: "saved", warnings: [] });
  });

  test("a clash blocks on legacy firmware", async () => {
    const outcome = await save(mockIO().io, "legacy");

    expect(outcome.kind).toBe("blocked");
  });

  test("a clash blocks before any write while the mode is unknown", async () => {
    const { io, steps } = mockIO();

    const outcome = await save(io, "unknown");

    expect(steps).toEqual([]);
    expect(outcome).toEqual({ kind: "blocked", conflicts: [], warnings: [], modeUnknown: true });
  });

  test("identical keymap Superkeys block while the mode is unknown", async () => {
    const { io, steps } = mockIO();
    const table = [CTRL_A, CTRL_A];
    const cells = [[SK(0), SK(1)]];

    const outcome = await runComboSave(
      io,
      input({ superkeys: superkeysInput({ draft: draftOf(table, cells, []), saved: savedOf(table, cells, []), mode: "unknown" }) }),
    );

    expect(steps).toEqual([]);
    expect(outcome).toMatchObject({ kind: "blocked", modeUnknown: true });
  });

  test("a clash-free table saves while the mode is unknown", async () => {
    const { io, steps } = mockIO();
    const table = [CTRL_A];
    const cells = [[SK(0)]];
    const next = [combo(0, A)];

    const outcome = await runComboSave(
      io,
      input({
        combos: next,
        superkeys: superkeysInput({ draft: draftOf(table, cells, next), saved: savedOf(table, cells, []), mode: "unknown" }),
      }),
    );

    expect(steps).toEqual(["combos 1", "names 1 1", "backup"]);
    expect(outcome.kind).toBe("saved");
  });
});

describe("runComboSave grandfathered clashes with a combo output member", () => {
  // Slot 0 is only a combo output and clashes with the keymap's slot 1 on the keyboard
  const layers = [[SK(1)]];
  const table = [SHIFT_A, CTRL_A];
  const loaded = [combo(0, SK(0))];

  const save = (combos: ComboType[]) =>
    runComboSave(
      mockIO().io,
      input({
        combos,
        savedCombos: serializeCombos(loaded),
        superkeys: superkeysInput({
          draft: draftOf(table, layers, combos),
          saved: savedOf(table, layers, loaded),
          baseline: draftOf(table, layers, loaded),
        }),
      }),
    );

  test("deleting the combo warns and saves", async () => {
    const outcome = await save([]);

    expect(outcome).toMatchObject({ kind: "saved", done: ["combos", "backup"] });
    expect(outcome.kind !== "blocked" && outcome.warnings).toHaveLength(1);
  });

  test("moving the combo to another layer warns and saves", async () => {
    const outcome = await save([{ ...combo(0, SK(0)), layer: 1 }]);

    expect(outcome).toMatchObject({ kind: "saved", done: ["combos", "backup"] });
    expect(outcome.kind !== "blocked" && outcome.warnings).toHaveLength(1);
  });
});

describe("runComboSave merged keymap Superkeys", () => {
  // Two identical dual-function Superkeys on the keymap, which the keyboard reads back as the lower one
  const table = [CTRL_A, CTRL_A];
  const layers = [[SK(0), SK(1)]];

  test("the merged cells are written to the keymap and returned as held", async () => {
    const { io, steps } = mockIO();

    const outcome = await runComboSave(
      io,
      input({ superkeys: superkeysInput({ draft: draftOf(table, layers, []), saved: savedOf(table, layers, []) }) }),
    );

    expect(steps).toEqual([`keymap ${SK(0)} ${SK(0)}|1`, "names 0 2", "backup"]);
    expect(outcome.kind !== "blocked" && outcome.superkeys?.layers).toEqual([[SK(0), SK(0)]]);
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved.keymapRefs).toEqual([0]);
  });

  test("a failed merge write keeps the loaded cells as held", async () => {
    const outcome = await runComboSave(
      mockIO({ keymap: true }).io,
      input({ superkeys: superkeysInput({ draft: draftOf(table, layers, []), saved: savedOf(table, layers, []) }) }),
    );

    expect(outcome).toMatchObject({ kind: "failed", failed: "keymap" });
    expect(outcome.kind !== "blocked" && outcome.superkeys?.layers).toBe(layers);
  });
});

describe("runComboSave unused Superkeys", () => {
  const layers = [[SK(0)]];
  const loadedCombos = [combo(0, SK(1))];
  // The edit drops the only reference to Superkey 1
  const combos = [combo(0, A)];
  const saved = savedOf([CTRL_A, FULL_B], layers, loadedCombos);

  const run = (io: ReturnType<typeof mockIO>["io"], overrides: Partial<ComboSuperkeyInput> = {}) =>
    runComboSave(
      io,
      input({
        combos,
        savedCombos: serializeCombos(loadedCombos),
        superkeys: superkeysInput({ draft: draftOf([CTRL_A, FULL_B], layers, combos), saved, collect: true, ...overrides }),
      }),
    );

  test("CollectAndLastReferenceDropped_SlotRemovedAfterCombosAndKeymapRewritten", async () => {
    const { io, steps } = mockIO();

    const outcome = await run(io);

    expect(steps).toEqual([
      "combos 1",
      `superkeys ${serializeSuperkeyTable([CTRL_A], "padded", 2)}`,
      `keymap ${SK(0)}|1`,
      "names 1 1",
      "backup",
    ]);
    expect(outcome).toMatchObject({
      kind: "saved",
      done: ["combos", "skgc", "keymapAfterGc", "backup"],
      superkeys: { table: [CTRL_A], saved: { storedRows: 1, keymapStale: false, keymapRefs: [0], comboRefs: [] } },
    });
  });

  test("NoCollect_SlotKept", async () => {
    const { io, steps } = mockIO();

    const outcome = await run(io, { collect: false });

    expect(steps).toEqual(["combos 1", "names 1 2", "backup"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["combos", "backup"], superkeys: { table: [CTRL_A, FULL_B] } });
  });

  test("DefaultLayerReference_SlotKept", async () => {
    const { io, steps } = mockIO();
    const draft = { ...draftOf([CTRL_A, FULL_B], layers, combos), defaultLayers: [[SK(1)]], layerOffset: 1 };

    await run(io, { draft });

    expect(steps).toEqual(["combos 1", "names 1 2", "backup"]);
  });

  test("UncertainKeymapSlot_SlotKept", async () => {
    const { io, steps } = mockIO();

    await run(io, { saved: { ...saved, uncertainKeymap: [1] } });

    expect(steps).toEqual(["combos 1", "names 1 2", "backup"]);
  });

  test("CleanUpWriteFails_TableUnknownAndKeymapStale", async () => {
    const { io, steps } = mockIO({ superkeys: true });

    const outcome = await run(io);

    expect(steps).toEqual(["combos 1", `superkeys ${serializeSuperkeyTable([CTRL_A], "padded", 2)}`]);
    expect(outcome).toMatchObject({
      kind: "failed",
      failed: "skgc",
      superkeys: { table: [CTRL_A, FULL_B], saved: { table: null, storedRows: null, keymapStale: true } },
    });
  });

  test("KeymapAfterCleanUpFails_StaysStaleWithCollectedTable", async () => {
    const { io } = mockIO({ keymap: true });

    const outcome = await run(io);

    expect(outcome).toMatchObject({
      kind: "failed",
      failed: "keymapAfterGc",
      done: ["combos", "skgc"],
      superkeys: { table: [CTRL_A], saved: { keymapStale: true, uncertainKeymap: [0] } },
    });
  });
});

describe("readKeymapReplies", () => {
  test("whole layers of key codes and a 0 or 1 flag are read", () => {
    expect(readKeymapReplies({ custom: "4 5 6 7", defaults: "", onlyCustom: "1\n" }, 2)).toEqual({
      custom: [
        [4, 5],
        [6, 7],
      ],
      defaults: [],
      onlyCustom: true,
    });
  });

  test.each([
    [{ custom: "4 5 6", defaults: "", onlyCustom: "1" }], // a partial layer
    [{ custom: "", defaults: "", onlyCustom: "1" }], // no custom layers
    [{ custom: "4 x", defaults: "", onlyCustom: "1" }], // a token that is no key code
    [{ custom: "4 65536", defaults: "", onlyCustom: "1" }], // a code out of range
    [{ custom: "4 5", defaults: "4", onlyCustom: "0" }], // a partial default layer
    [{ custom: "4 5", defaults: "", onlyCustom: "2" }], // a flag that is neither 0 nor 1
    [{ custom: "4 5", defaults: "", onlyCustom: "" }], // an empty flag
    [{ custom: new Error("timeout"), defaults: "", onlyCustom: "1" }], // a failed request
  ])("an unusable reply gives null", replies => {
    expect(readKeymapReplies(replies, 2)).toBeNull();
  });
});

describe("runComboSave failures", () => {
  test("a failed superkeys.map write stops and leaves the table unknown and the keymap stale", async () => {
    const { io, steps } = mockIO({ superkeys: true });
    const combos = [combo(0, SK(1))];
    const saved = savedOf([CTRL_A], [[SK(0)]], []);

    const outcome = await runComboSave(
      io,
      input({ combos, superkeys: superkeysInput({ draft: draftOf([CTRL_A, FULL_B], [[SK(0)]], combos), saved }) }),
    );

    expect(steps).toHaveLength(1);
    expect(outcome).toMatchObject({ kind: "failed", failed: "superkeys", done: [] });
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved).toEqual({
      ...saved,
      table: null,
      storedRows: null,
      keymapStale: true,
      cleanupDone: true,
    });
  });

  test("a failed keymap write keeps it stale and its Superkeys uncertain", async () => {
    const { io } = mockIO({ keymap: true });
    const combos = [combo(0, SK(1))];
    const saved = savedOf([CTRL_A], [[SK(0)]], []);

    const outcome = await runComboSave(
      io,
      input({ combos, superkeys: superkeysInput({ draft: draftOf([CTRL_A, FULL_B], [[SK(0)]], combos), saved }) }),
    );

    expect(outcome).toMatchObject({ kind: "failed", failed: "keymap", done: ["superkeys"] });
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved).toMatchObject({ keymapStale: true, uncertainKeymap: [0] });
  });

  test("a failed combos.map write marks the result slots uncertain and forces the next combos write", async () => {
    const { io, steps } = mockIO({ combos: true });
    const combos = [combo(0, SK(1)), combo(1, SK(2))];
    const table = [CTRL_A, FULL_B, FULL_B];
    const saved = savedOf(table, [[SK(0)]], []);

    const outcome = await runComboSave(
      io,
      input({ combos, superkeys: superkeysInput({ draft: draftOf(table, [[SK(0)]], combos), saved }) }),
    );

    expect(steps).toEqual(["combos 2"]);
    expect(outcome).toMatchObject({ kind: "failed", failed: "combos", savedCombos: null });
    expect(outcome.kind !== "blocked" && outcome.superkeys?.saved).toMatchObject({ comboRefs: [], uncertainCombos: [1, 2] });
  });
});

describe("runComboSave backup", () => {
  test("the commands the backup records are read again before it", async () => {
    const { io, steps } = mockIO();

    const outcome = await runComboSave(io, input({ combos: [combo(0, A)], rereadBeforeBackup: true }));

    expect(steps).toEqual(["combos 1", "names 1 -", "previews", "backup"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["combos", "backup"] });
  });

  test("an unreadable command skips the backup and keeps the save on a real keyboard", async () => {
    const { io, steps } = mockIO({ previews: "qukeys.holdTimeout" });

    const outcome = await runComboSave(io, input({ combos: [combo(0, A)], rereadBeforeBackup: true }));

    expect(steps).toEqual(["combos 1", "names 1 -", "previews"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["combos"], backupSkipped: "qukeys.holdTimeout" });
  });

  test("an unreadable command or a failed backup fails the save on a virtual keyboard", async () => {
    const skipped = await runComboSave(
      mockIO({ previews: "qukeys.holdTimeout" }).io,
      input({ combos: [combo(0, A)], rereadBeforeBackup: true, isVirtual: true }),
    );
    const failed = await runComboSave(mockIO({ backup: true }).io, input({ combos: [combo(0, A)], isVirtual: true }));

    expect(skipped).toMatchObject({ kind: "failed", failed: "backup" });
    expect(failed).toMatchObject({ kind: "failed", failed: "backup" });
  });

  test("an unreadable superkeys.map skips the backup and keeps the save on a real keyboard", async () => {
    const { io, steps } = mockIO({ previews: "superkeys.map" });

    const outcome = await runComboSave(io, input({ combos: [combo(0, A)], rereadBeforeBackup: true }));

    expect(steps).toEqual(["combos 1", "names 1 -", "previews"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["combos"], backupSkipped: "superkeys.map" });
  });

  test("a failed backup keeps the save on a real keyboard", async () => {
    const outcome = await runComboSave(mockIO({ backup: true }).io, input({ combos: [combo(0, A)] }));

    expect(outcome).toMatchObject({ kind: "saved", done: ["combos"] });
    expect(outcome.kind !== "blocked" && outcome.backupError).toBeInstanceOf(Error);
  });
});

describe("loadKeymapReplies", () => {
  test("MultilineReply_LoadsEveryCode", () => {
    // Split a default layer across lines, so a Superkey reference sits after the line break
    const loaded = loadKeymapReplies({ custom: "4 5", defaults: "4\r\n53980", onlyCustom: "0" }, 2);

    expect(loaded).toEqual({ custom: [[4, 5]], defaults: [[4, 53980]], onlyCustom: false, known: true });
  });

  test("ShortReply_LoadsForDisplayOnly", () => {
    const loaded = loadKeymapReplies({ custom: "4 5", defaults: "4 5 53980", onlyCustom: "1" }, 2);

    expect(loaded.known).toBe(false);
    expect(loaded.custom).toEqual([[4, 5]]);
    expect(loaded.onlyCustom).toBe(true);
  });
});

describe("runComboSave custom LED effects", () => {
  const SLOT_0 = 17155;
  const SLOT_1 = 17156;
  const red: LedCustomSlot = { type: 1, r: 255, g: 0, b: 0, speed: 0 };
  const off: LedCustomSlot = { type: 6, r: 0, g: 0, b: 0, speed: 0 };

  const ledTable = (entries: Record<number, LedCustomSlot>): LedCustomSlot[] => {
    const table = emptyLedTable();
    Object.entries(entries).forEach(([slot, settings]) => {
      table[Number(slot)] = settings;
    });
    return table;
  };

  const ledIO = (fail: Fail & { led?: boolean } = {}) => {
    const { io, steps } = mockIO(fail);
    const writeLedCustom = vi.fn(async (table: LedCustomSlot[]) => {
      steps.push(`led ${serializeLedCustom(table)}`);

      if (fail.led) {
        throw new Error("led.custom write failed");
      }
    });
    return { io: { ...io, writeLedCustom }, steps };
  };

  /* The keyboard's only combo sends slot 0 */
  const ledInput = (table: LedCustomSlot[], stored: LedCustomSlot[], overrides: Partial<ComboLedInput> = {}): ComboLedInput => ({
    table,
    saved: withLedBaseline(stored, { layers: [[A]], rules: [], combos: [combo(0, SLOT_0)] }),
    collect: true,
    layers: [[A]],
    rules: [],
    ...overrides,
  });

  test("writes led.custom before combos.map and frees the old slot after it", async () => {
    const { io, steps } = ledIO();
    const stored = ledTable({ 0: red });
    const combos = [combo(0, SLOT_1)];

    const outcome = await runComboSave(
      io,
      input({
        combos,
        savedCombos: serializeCombos([combo(0, SLOT_0)]),
        ledCustom: ledInput(ledTable({ 0: red, 1: off }), stored),
      }),
    );

    expect(steps).toEqual(["led 2 1 255 0 0 0 6 0 0 0 0", "combos 1", "led 2 0 0 0 0 0 6 0 0 0 0", "names 1 -", "backup"]);
    expect(outcome).toMatchObject({ kind: "saved", done: ["ledTable", "combos", "ledGc", "backup"] });
    expect(outcome.kind !== "blocked" && outcome.ledCustom).toEqual({
      table: ledTable({ 1: off }),
      saved: { ...EMPTY_LED_SAVED, table: "2 0 0 0 0 0 6 0 0 0 0", comboRefs: [1] },
    });
  });

  test("keeps the slots the keymap and rules use", async () => {
    const { io, steps } = ledIO();
    const stored = ledTable({ 0: red, 1: off });

    await runComboSave(
      io,
      input({
        combos: [],
        savedCombos: serializeCombos([combo(0, SLOT_0)]),
        ledCustom: ledInput(stored, stored, { layers: [[SLOT_0]], rules: [{ output: SLOT_1 }] }),
      }),
    );

    expect(steps).toEqual(["combos 0", "names 0 -", "backup"]);
  });

  test("protects the slot of a failed combos write", async () => {
    const { io, steps } = ledIO({ combos: true });
    const stored = ledTable({ 0: red });

    const outcome = await runComboSave(
      io,
      input({
        combos: [combo(0, SLOT_1)],
        savedCombos: serializeCombos([combo(0, SLOT_0)]),
        ledCustom: ledInput(ledTable({ 0: red, 1: off }), stored),
      }),
    );

    expect(steps).toEqual(["led 2 1 255 0 0 0 6 0 0 0 0", "combos 1"]);
    expect(outcome.kind !== "blocked" && outcome.ledCustom?.saved).toMatchObject({ comboRefs: [0], uncertainCombos: [1] });
  });

  test("stops before combos.map when the table write fails", async () => {
    const { io, steps } = ledIO({ led: true });

    const outcome = await runComboSave(
      io,
      input({
        combos: [combo(0, SLOT_1)],
        savedCombos: serializeCombos([combo(0, SLOT_0)]),
        ledCustom: ledInput(ledTable({ 0: red, 1: off }), ledTable({ 0: red })),
      }),
    );

    expect(steps).toEqual(["led 2 1 255 0 0 0 6 0 0 0 0"]);
    expect(outcome).toMatchObject({ kind: "failed", failed: "ledTable" });
    expect(outcome.kind !== "blocked" && outcome.ledCustom?.saved.table).toBeNull();
  });
});
