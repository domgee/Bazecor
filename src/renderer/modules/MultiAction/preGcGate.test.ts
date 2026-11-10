import { describe, expect, test, vi } from "vitest";
import { Conflict, PreparedSuperkeyWrite } from "../../../api/parsers/multiAction";
import { PreGcIo, RecoveryCoverage, planPreGc, recoveryPaths, runPreGc, withRecoveryBackup } from "./preGcGate";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const IDLE = [1, 1, 1, 1, 1];
const CTRL = 224;
// Five actions, so the firmware runs it as a Superkey
const full = (tap: number) => [tap, CTRL, 5, 1, 1];

const PATH = "/backups/Sonsei/n1/20261110120000123-Sonsei-before-cleanup.json";

const prepared = (table: number[][], conflicts: Conflict[] = []): PreparedSuperkeyWrite => ({
  table,
  layers: [[]],
  merges: new Map(),
  conflicts,
  warnings: [],
});

const base = {
  collect: true,
  isVirtual: false,
  previewsOk: true,
  persistedTable: [full(4), full(6)],
  removals: [{ slot: 1, actions: full(6) }],
  covered: new Map() as RecoveryCoverage,
};

describe("planPreGc", () => {
  test.each([
    [{ previewsOk: false }, { action: "skipGc", reason: "previews" }], // unreadable previews
    [{ persistedTable: null }, { action: "skipGc", reason: "tableUnknown" }], // unknown persisted table
    [{ isVirtual: true }, { action: "skipGc", reason: "virtual" }], // virtual keyboard
    [{ collect: false }, { action: "skipGc", reason: "notReady" }], // Superkeys, combos or rules unread
    [{ removals: [] }, { action: "none" }], // nothing removed
    [{ covered: new Map([[1, { key: "6,224,5,1,1", path: PATH }]]) }, { action: "none" }], // removal already in a backup
    [{}, { action: "backup" }], // removal in no backup
  ])("%o gives %o", (change, expected) => {
    expect(planPreGc({ ...base, ...change })).toEqual(expected);
  });
});

describe("runPreGc", () => {
  const collected = prepared([full(4)]);
  const kept = prepared([full(4), full(6)]);

  const createIo = (backup: PreGcIo["backup"]) => ({
    prepare: vi.fn((collect: boolean) => (collect ? collected : kept)),
    removals: vi.fn(() => [{ slot: 1, actions: full(6) }]),
    backup: vi.fn(backup),
  });

  const input = { collect: true, isVirtual: false, previewsOk: true, persistedTable: [full(4), full(6)], covered: new Map() };

  test("UncoveredRemoval_BackupTakenBeforeCollecting", async () => {
    const io = createIo(async () => ({ path: PATH, table: [full(4), full(6)] }));

    const result = await runPreGc(input, io);

    expect(io.prepare.mock.calls).toEqual([[true]]);
    expect(result).toEqual({
      prepared: collected,
      collect: true,
      removals: [{ slot: 1, actions: full(6) }],
      covered: new Map([
        [0, { key: "4,224,5,1,1", path: PATH }],
        [1, { key: "6,224,5,1,1", path: PATH }],
      ]),
    });
  });

  test("CoveredRemoval_NoBackup", async () => {
    const io = createIo(async () => ({ path: PATH, table: [] }));
    const covered: RecoveryCoverage = new Map([[1, { key: "6,224,5,1,1", path: PATH }]]);

    const result = await runPreGc({ ...input, covered }, io);

    expect(io.backup).not.toHaveBeenCalled();
    expect(result.collect).toBe(true);
    expect(result.prepared).toBe(collected);
  });

  test("BackupFails_PreparedAgainWithoutCollectingAndCoverageKept", async () => {
    const io = createIo(async () => {
      throw new Error("disk full");
    });

    const result = await runPreGc(input, io);

    // Prepare again, so the conflict check runs on the table the save writes
    expect(io.prepare.mock.calls).toEqual([[true], [false]]);
    expect(result).toEqual({
      prepared: kept,
      collect: false,
      removals: [],
      covered: new Map(),
      skipped: "backupFailed",
      error: new Error("disk full"),
    });
  });

  test("BackupHoldsAnotherDefinition_PreparedAgainWithoutCollecting", async () => {
    // The keyboard held a different slot 1 than the editor knew
    const io = createIo(async () => ({ path: PATH, table: [full(4), full(7)] }));

    const result = await runPreGc(input, io);

    expect(io.prepare.mock.calls).toEqual([[true], [false]]);
    expect(result.collect).toBe(false);
    expect(result.prepared).toBe(kept);
    expect(result.skipped).toBe("backupFailed");
  });

  test("ConflictWhenCollecting_NoBackup", async () => {
    const conflict = { code: 1, members: [], winner: [4, 224], signature: "x" } as unknown as Conflict;
    const blocked = prepared([full(4)], [conflict]);
    const io = { ...createIo(async () => ({ path: PATH, table: [] })), prepare: vi.fn(() => blocked) };

    const result = await runPreGc(input, io);

    expect(io.backup).not.toHaveBeenCalled();
    expect(result.prepared.conflicts).toEqual([conflict]);
  });

  test("UnknownTable_PreparedOnceWithoutCollecting", async () => {
    const io = createIo(async () => ({ path: PATH, table: [] }));

    const result = await runPreGc({ ...input, persistedTable: null }, io);

    expect(io.prepare.mock.calls).toEqual([[false]]);
    expect(io.backup).not.toHaveBeenCalled();
    expect(result).toEqual({ prepared: kept, collect: false, removals: [], covered: new Map(), skipped: "tableUnknown" });
  });

  test("NotCollecting_PreparedWithoutCollectingAndNothingSkipped", async () => {
    const io = createIo(async () => ({ path: PATH, table: [] }));

    const result = await runPreGc({ ...input, collect: false }, io);

    expect(io.prepare.mock.calls).toEqual([[false]]);
    expect(result).toEqual({ prepared: kept, collect: false, removals: [], covered: new Map(), skipped: undefined });
  });
});

describe("recovery coverage", () => {
  test("BackupWithIdleRows_OnlyDefinedSlotsCovered", () => {
    const covered = withRecoveryBackup(new Map(), [full(4), IDLE, full(6)], PATH);

    expect([...covered.keys()]).toEqual([0, 2]);
  });

  test("RemovedSlots_PathsOfMatchingBackups", () => {
    const covered: RecoveryCoverage = new Map([
      [0, { key: "4,224,5,1,1", path: "a.json" }],
      [1, { key: "6,224,5,1,1", path: "b.json" }],
      [2, { key: "4,224,5,1,1", path: "a.json" }],
    ]);

    const paths = recoveryPaths(
      [
        { slot: 0, actions: full(4) },
        { slot: 1, actions: full(7) },
        { slot: 2, actions: full(4) },
      ],
      covered,
    );

    expect(paths).toEqual(["a.json"]);
  });
});
