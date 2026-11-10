import { describe, expect, test, vi } from "vitest";
import { HoldModsState } from "@Renderer/types/holdMods";
import { altRepeatMissed, createHoldModsSync, holdModsRetryWanted } from "./holdModsSync";
import { loadHoldModsForEditor } from "./layoutLoad";
import { keymapSaveKey, runLayoutSave, withHoldBaseline } from "./layoutSave";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const PARTIAL = 0x982b;
const PARTIAL_SLOT_1 = 0xb82b;
const GUI = 16;
const SHIFT = 8;

/* A promise the test settles by hand */
const deferred = <T>() => {
  let resolve: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("createHoldModsSync", () => {
  test("a load applies when nothing else happened", () => {
    const sync = createHoldModsSync();

    const token = sync.beginLoad();

    expect(sync.loading()).toBe(true);
    expect(sync.finishLoad(token)).toBe(true);
    expect(sync.loading()).toBe(false);
  });

  test("only the newest load applies", () => {
    const sync = createHoldModsSync();
    const first = sync.beginLoad();
    const second = sync.beginLoad();

    expect(sync.finishLoad(first)).toBe(false);
    expect(sync.finishLoad(second)).toBe(true);
  });

  test("a load that a table edit made stale does not apply", () => {
    const sync = createHoldModsSync();
    const token = sync.beginLoad();

    sync.edited();

    expect(sync.finishLoad(token)).toBe(false);
    expect(sync.loading()).toBe(false);
  });

  test("a load asked for during a save waits for the save to end", () => {
    const sync = createHoldModsSync();
    const save = sync.beginSave();

    expect(sync.beginLoad()).toBeNull();
    expect(sync.loadAppliedSince(save)).toBe(false);
    expect(sync.endSave()).toBe(true);
    expect(sync.beginLoad()).not.toBeNull();
  });

  test("a save without loads needs no load after it", () => {
    const sync = createHoldModsSync();
    const save = sync.beginSave();

    expect(sync.loadAppliedSince(save)).toBe(false);
    expect(sync.endSave()).toBe(false);
  });

  test("a load that finishes during a save keeps neither view and loads again after the save", async () => {
    // Load a keyboard whose keymap read hangs until the save is over
    const keymapRead = deferred<string>();
    const noCacheCommand = vi.fn(async (cmd: string): Promise<unknown> => {
      const replies: Record<string, unknown> = {
        help: "holdmods.map",
        "holdmods.map": `1 ${PARTIAL} ${GUI}`,
        "keymap.custom": keymapRead.promise,
        "keymap.onlyCustom": "1",
      };
      return replies[cmd];
    });
    const sync = createHoldModsSync();
    const saved = withHoldBaseline([{ code: PARTIAL, held: GUI }], {
      keymap: keymapSaveKey([PARTIAL], true),
      keymapCodes: [PARTIAL],
      ruleRefs: [],
    });

    const token = sync.beginLoad();
    const loading = loadHoldModsForEditor({ noCacheCommand }, "Sonsei");
    const save = sync.beginSave();
    const failingKeymap = {
      writeHoldMods: vi.fn(async () => undefined),
      writeKeymap: vi.fn(async () => {
        throw new Error("keymap.custom write failed");
      }),
      writeRules: vi.fn(async () => undefined),
    };
    const outcome = await runLayoutSave(failingKeymap, {
      mode: "settled",
      layers: [[PARTIAL_SLOT_1]],
      rules: [],
      rulesReady: true,
      onlyCustom: true,
      table: [
        { code: PARTIAL, held: GUI },
        { code: PARTIAL_SLOT_1, held: SHIFT },
      ],
      saved,
      savedRules: "0",
    });
    keymapRead.resolve(`${PARTIAL}`);
    const result = await loading;

    // The load read the keymap before the failed write could land, so the editor keeps the save's view and loads again
    expect(result.state).toBe("ready");
    expect(sync.finishLoad(token)).toBe(false);
    expect(outcome.failed).toBe("keymap");
    expect(sync.loadAppliedSince(save)).toBe(false);
    expect(sync.endSave()).toBe(true);
  });
});

describe("holdModsRetryWanted", () => {
  test.each([
    ["loading", 3, false, true], // Help could not be read
    ["failed", 3, false, true], // The table could not be read
    ["ready", 3, false, false],
    ["unsupported", 3, false, false],
    ["loading", -1, false, false], // No key picked
    ["failed", 3, true, false], // A load runs
  ] as [HoldModsState, number, boolean, boolean][])(
    "state %s, key %i, loading %s retries: %s",
    (state, keyIndex, loading, expected) => {
      expect(holdModsRetryWanted(state, keyIndex, loading)).toBe(expected);
    },
  );
});

describe("altRepeatMissed", () => {
  test.each([
    [true, false, true], // App's help read failed
    [true, undefined, true],
    [true, true, false],
    [false, false, false],
  ])("help lists rules %s, capability %s: %s", (listed, capability, expected) => {
    expect(altRepeatMissed(listed, capability)).toBe(expected);
  });
});
