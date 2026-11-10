import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { COMBO_POSITION_UNUSED, ComboType, MAX_COMBO_MEMBERS } from "@Renderer/types/combos";
import { dualUseCodeFor } from "./altRepeat";
import {
  LayoutRefs,
  MultiActionState,
  SkRef,
  SuperkeyDraft,
  applyMultiAction,
  cloneSuperkeyRefs,
  collectSuperkeys,
  conflictMessage,
  definedSlots,
  dualUseOnlyCode,
  finalGcTable,
  freeSlot,
  gcRemovals,
  multiActionBreaks,
  prepareSuperkeyWrite,
  qukeyCollisions,
  reconcileDraft,
  remapFileSuperkeys,
  superkeyRefs,
  superkeyTapSeed,
  tapSeedRefused,
} from "./multiAction";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const SK = (slot: number) => 53980 + slot;
const IDLE = [1, 1, 1, 1, 1];
const A = 4;
const B = 5;
const CTRL = 224;
const SHIFT = 225;
// A tap and Ctrl hold, the shape the firmware stores as a qukey
const tapHold = (tap: number, hold: number) => [tap, hold, 1, 1, 1];
// Five actions, so the firmware runs it as a Superkey
const full = (tap: number) => [tap, CTRL, B, 1, 1];

const rule = (layer: number, position: number, output: number): AltRepeatRule => ({ layer, position, previous: A, output });

const combo = (index: number, positions: number[], layer: number, action: number): ComboType => {
  const members = new Array<number>(MAX_COMBO_MEMBERS).fill(COMBO_POSITION_UNUSED);
  positions.forEach((position, i) => {
    members[i] = position;
  });
  return { id: index, name: "", positions: members, layer, flags: 1, action };
};

// Combos on layer 0 with distinct members, one per output
const outputs = (actions: number[]): ComboType[] => actions.map((action, i) => combo(i, [i, i + 1], 0, action));

const layout = (customLayers: number[][], extra: Partial<LayoutRefs> = {}): LayoutRefs => ({
  customLayers,
  defaultLayers: [],
  layerOffset: 0,
  rules: [],
  combos: [],
  ...extra,
});

const draftOf = (table: number[][], customLayers: number[][], extra: Partial<LayoutRefs> = {}): SuperkeyDraft => ({
  table,
  ...layout(customLayers, extra),
});

const cell = (layer: number, position: number): SkRef => ({ kind: "cell", layer, position, custom: true });

const stateOf = (table: number[][], refs: LayoutRefs, currentCode: number, extra: Partial<MultiActionState> = {}): MultiActionState => ({
  table,
  refs: superkeyRefs(refs),
  protectedSlots: new Set(),
  currentCode,
  ...extra,
});

describe("superkeyRefs and freeSlot", () => {
  test("collects references from custom and default layers, rules and combos", () => {
    const refs = superkeyRefs(
      layout([[SK(0), A]], { defaultLayers: [[SK(1)]], layerOffset: 1, rules: [rule(1, 1, SK(0))], combos: outputs([A, SK(2)]) }),
    );

    expect(refs).toEqual(
      new Map([
        [
          0,
          [
            { kind: "cell", layer: 1, position: 0, custom: true },
            { kind: "rule", index: 0 },
          ],
        ],
        [1, [{ kind: "cell", layer: 0, position: 0, custom: false }]],
        [2, [{ kind: "combo", index: 1 }]],
      ]),
    );
  });

  test("finds the lowest free slot below 70", () => {
    expect(freeSlot(new Set([0, 1, 3]))).toBe(2);
    expect(freeSlot(new Set(Array.from({ length: 70 }, (_, i) => i)))).toBeNull();
  });
});

describe("applyMultiAction", () => {
  describe("a shared Superkey is edited in place (P1)", () => {
    const table = [tapHold(A, CTRL)];

    test.each([
      ["another cell", layout([[SK(0), SK(0)]])],
      ["a rule", layout([[SK(0), A]], { rules: [rule(0, 1, SK(0))] })],
      ["a combo", layout([[SK(0), A]], { combos: outputs([SK(0)]) })],
    ])("shared with %s, through tap-only and all idle", (_, refs) => {
      const state = stateOf(table, refs, SK(0));

      expect(applyMultiAction(state, cell(0, 0), [B])).toEqual({ table: [[B, 1, 1, 1, 1]], code: SK(0) });
      expect(applyMultiAction(state, cell(0, 0), [])).toEqual({ table: [IDLE], code: SK(0) });
      expect(applyMultiAction(state, cell(0, 0), full(B))).toEqual({ table: [full(B)], code: SK(0) });
    });
  });

  describe("empty and tap-only actions (P2)", () => {
    test("an idle cell or combo becomes 0 and an idle rule is refused", () => {
      const state = stateOf([], layout([[A]]), A);

      expect(applyMultiAction(state, cell(0, 0), [0, 0])).toEqual({ table: [], code: 0 });
      expect(applyMultiAction(state, { kind: "combo", index: 0 }, [])).toEqual({ table: [], code: 0 });
      expect(applyMultiAction(state, { kind: "rule", index: 0 }, [])).toEqual({ error: "emptyRule" });
    });

    test("a tap-only cell, combo or allowed rule output is the tap", () => {
      const state = stateOf([], layout([[A]]), A);

      expect(applyMultiAction(state, cell(0, 0), [B])).toEqual({ table: [], code: B });
      expect(applyMultiAction(state, { kind: "combo", index: 0 }, [B])).toEqual({ table: [], code: B });
      expect(applyMultiAction(state, { kind: "rule", index: 0 }, [B])).toEqual({ table: [], code: B });
    });

    test("a tap-only rule output the firmware rejects becomes a Superkey", () => {
      // Space with a Ctrl hold, a dual-use code that previous-key outputs cannot hold
      const dualUse = dualUseCodeFor(44, CTRL) as number;
      const state = stateOf([], layout([[A]]), A);

      expect(applyMultiAction(state, { kind: "rule", index: 0 }, [dualUse])).toEqual({ table: [[dualUse, 1, 1, 1, 1]], code: SK(0) });
    });
  });

  test("a cell with only tap and hold becomes a dual-use code, and a combo becomes a Superkey", () => {
    const state = stateOf([], layout([[A]]), A);

    expect(applyMultiAction(state, cell(0, 0), tapHold(B, CTRL))).toEqual({ table: [], code: dualUseCodeFor(B, CTRL) });
    expect(applyMultiAction(state, { kind: "combo", index: 0 }, tapHold(B, CTRL))).toEqual({ table: [tapHold(B, CTRL)], code: SK(0) });
  });

  test("an owned Superkey with only tap and hold becomes a dual-use code and keeps its slot until GC", () => {
    const state = stateOf([full(A)], layout([[SK(0)]]), SK(0));

    expect(applyMultiAction(state, cell(0, 0), tapHold(B, SHIFT))).toEqual({ table: [full(A)], code: dualUseCodeFor(B, SHIFT) });
  });

  test("a tap and hold no dual-use code carries stays a Superkey", () => {
    const state = stateOf([], layout([[A]]), A);

    // A right Shift hold has no dual-use label
    expect(applyMultiAction(state, cell(0, 0), tapHold(B, 229))).toEqual({ table: [tapHold(B, 229)], code: SK(0) });
  });

  test("an owned Superkey is edited in place", () => {
    const state = stateOf([full(A), full(B)], layout([[SK(1), SK(0)]]), SK(1));

    expect(applyMultiAction(state, cell(0, 0), full(A))).toEqual({ table: [full(A), full(A)], code: SK(1) });
  });

  test("an owned reference past the table length is filled in with idle gaps (P6)", () => {
    const state = stateOf([full(A)], layout([[SK(3)]]), SK(3));

    expect(applyMultiAction(state, cell(0, 0), full(B))).toEqual({ table: [full(A), IDLE, IDLE, full(B)], code: SK(3) });
  });

  test("a new Superkey takes the lowest slot no reference or protection uses", () => {
    const state = stateOf([full(A), full(A), full(A)], layout([[A, SK(0)]], { combos: outputs([SK(2)]) }), A, {
      protectedSlots: new Set([1]),
    });

    expect(applyMultiAction(state, cell(0, 0), full(B))).toEqual({ table: [full(A), full(A), full(A), full(B)], code: SK(3) });
  });

  test("a new Superkey reuses the target's own baseline slot when nothing else uses it", () => {
    const state = stateOf([full(A), full(A)], layout([[A]]), A, { protectedSlots: new Set([1]), ownBaselineSlot: 1 });

    expect(applyMultiAction(state, cell(0, 0), full(B))).toEqual({ table: [full(A), full(B)], code: SK(1) });
  });

  test("a full table refuses a new Superkey", () => {
    const table = Array.from({ length: 70 }, () => full(A));
    const state = stateOf(table, layout([[A, ...table.map((_, i) => SK(i))]]), A);

    expect(applyMultiAction(state, cell(0, 0), full(B))).toEqual({ error: "capacity" });
  });

  test("a Superkey at or above 70 is edited into a new slot below 70, and only this reference changes (Q7)", () => {
    const refs = layout([[SK(75), SK(75), SK(0)]]);
    const state = stateOf([full(A)], refs, SK(75));

    const result = applyMultiAction(state, cell(0, 0), full(B));

    expect(result).toEqual({ table: [full(A), full(B)], code: SK(1) });
  });
});

describe("collectSuperkeys", () => {
  test("drop mode idles unkept slots and drops trailing idle rows that are not kept", () => {
    expect(collectSuperkeys([full(A), full(B), full(A), full(B)], new Set([1]), "drop")).toEqual([IDLE, full(B)]);
  });

  test("drop mode keeps a trailing idle row that is kept (P9)", () => {
    expect(collectSuperkeys([full(A), full(B), IDLE], new Set([0, 2]), "drop")).toEqual([full(A), IDLE, IDLE]);
  });

  test("idle-only mode never shortens the table", () => {
    expect(collectSuperkeys([full(A), full(B), full(A)], new Set([0]), "idleOnly")).toEqual([full(A), IDLE, IDLE]);
  });

  test("returns the input when nothing changes", () => {
    const table = [full(A), full(B)];

    expect(collectSuperkeys(table, new Set([0, 1]), "drop")).toBe(table);
  });
});

describe("qukeyCollisions", () => {
  const CTRL_A = [0x104, CTRL, 1, 1, 1];
  const SHIFT_A = [0x804, CTRL, 1, 1, 1];

  test("identical keymap Superkeys merge into the lowest slot of the group, also a combo-only one", () => {
    const table = [full(A), full(A), CTRL_A, IDLE, IDLE, IDLE, CTRL_A, IDLE, IDLE, IDLE, IDLE, CTRL_A];

    const collisions = qukeyCollisions(table, layout([[SK(11), SK(6)]], { combos: outputs([SK(2)]) }));

    expect(collisions).toEqual({
      merges: new Map([
        [11, 2],
        [6, 2],
      ]),
      conflicts: [],
    });
  });

  test("a lower registered Superkey with a modifier tap shadows a keymap Superkey with the same code", () => {
    // Shift tap with a Ctrl hold, and tap 0x61 with a Ctrl hold, both give the code DUM + 0x61
    const conflicts = qukeyCollisions([[0xe1, CTRL, 1, 1, 1], [0x61, CTRL, 1, 1, 1]], layout([[SK(1)]])).conflicts;

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].winner).toEqual([0xe1, CTRL]);
  });

  test("cells of a modifier-tap Superkey are not converted, so they alone make no group", () => {
    expect(qukeyCollisions([[0xe1, CTRL, 1, 1, 1], [0xe1, 0x1e0, 1, 1, 1]], layout([[SK(0)]]))).toEqual({
      merges: new Map(),
      conflicts: [],
    });
  });

  test("taps that differ only in modifier flags conflict", () => {
    const collisions = qukeyCollisions([CTRL_A, SHIFT_A], layout([[SK(0), SK(1)]]));

    expect(collisions.conflicts).toHaveLength(1);
    expect(collisions.conflicts[0].winner).toEqual([0x104, CTRL]);
    expect(collisions.conflicts[0].members.map(member => member.slot)).toEqual([0, 1]);
  });

  test("a combo-only or unused collider conflicts with a keymap Superkey", () => {
    expect(qukeyCollisions([CTRL_A, SHIFT_A], layout([[SK(1)]], { combos: outputs([SK(0)]) })).conflicts).toHaveLength(1);
    expect(qukeyCollisions([CTRL_A, SHIFT_A], layout([[SK(1)]])).conflicts).toHaveLength(1);
  });

  test("combo and rule references alone are exempt", () => {
    expect(qukeyCollisions([CTRL_A, SHIFT_A], layout([[A]], { combos: outputs([SK(0)]), rules: [rule(0, 0, SK(1))] }))).toEqual({
      merges: new Map(),
      conflicts: [],
    });
  });

  test("a dual-use cell agrees with an identical Superkey and conflicts with a different one", () => {
    const dualUse = dualUseCodeFor(A, 17450) as number;

    expect(qukeyCollisions([tapHold(A, 17450)], layout([[dualUse, SK(0)]])).conflicts).toEqual([]);

    // Left Ctrl with the right-side flag and a native right Ctrl dual-use cell share one code
    const rightCtrl = 49169 + 4 * 256 + A;
    const conflicts = qukeyCollisions([tapHold(A, 0x1e0)], layout([[rightCtrl, SK(0)]])).conflicts;

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].members).toEqual([
      { slot: 0, refs: [cell(0, 1)], protectedOnly: false, definition: [A, 0x1e0] },
      { refs: [cell(0, 0)], protectedOnly: false, definition: [A, 0xe4] },
    ]);
  });
});

describe("prepareSuperkeyWrite", () => {
  const CTRL_A = [0x104, CTRL, 1, 1, 1];
  const SHIFT_A = [0x804, CTRL, 1, 1, 1];
  const ALT_A = [0x204, CTRL, 1, 1, 1];

  test("an unused collider does not block when collecting", () => {
    const prepared = prepareSuperkeyWrite({
      draft: draftOf([SHIFT_A, CTRL_A], [[SK(1)]]),
      saved: {},
      baseline: null,
      collect: true,
      format: "padded",
    });

    expect(prepared).toEqual({ table: [IDLE, CTRL_A], layers: [[SK(1)]], merges: new Map(), conflicts: [], warnings: [] });
  });

  test("an unused collider blocks without collecting", () => {
    const prepared = prepareSuperkeyWrite({
      draft: draftOf([SHIFT_A, CTRL_A], [[SK(1)]]),
      saved: {},
      baseline: null,
      collect: false,
      format: "padded",
    });

    expect(prepared.conflicts).toHaveLength(1);
  });

  test.each([true, false])("a protected-only collider blocks, collect %s (Q3)", collect => {
    const prepared = prepareSuperkeyWrite({
      draft: draftOf([SHIFT_A, CTRL_A], [[SK(1)]]),
      saved: { keymapRefs: [0] },
      baseline: null,
      collect,
      format: "padded",
    });

    expect(prepared.table).toEqual([SHIFT_A, CTRL_A]);
    expect(prepared.conflicts).toHaveLength(1);
    expect(prepared.conflicts[0].members[0]).toMatchObject({ slot: 0, protectedOnly: true });
    expect(conflictMessage(prepared.conflicts[0])).toBe(
      "Superkey 1 is still saved on the keyboard and would be played for Layer 1 key 0. Save the other change first, then set this key again.",
    );
  });

  test("merges cells into the lowest identical slot, which a combo references", () => {
    const prepared = prepareSuperkeyWrite({
      draft: draftOf([CTRL_A, CTRL_A, CTRL_A], [[SK(1), SK(2)]], { combos: outputs([SK(0)]) }),
      saved: {},
      baseline: null,
      collect: true,
      format: "padded",
    });

    expect(prepared).toEqual({
      table: [CTRL_A],
      layers: [[SK(0), SK(0)]],
      merges: new Map([
        [1, 0],
        [2, 0],
      ]),
      conflicts: [],
      warnings: [],
    });
  });

  test("merges, then collects the merged-away slot", () => {
    const prepared = prepareSuperkeyWrite({
      draft: draftOf([CTRL_A, CTRL_A], [[SK(1), SK(0)]]),
      saved: {},
      baseline: null,
      collect: true,
      format: "padded",
    });

    expect(prepared).toEqual({ table: [CTRL_A], layers: [[SK(0), SK(0)]], merges: new Map([[1, 0]]), conflicts: [], warnings: [] });
  });

  describe("pre-existing conflicts (Q4, A2)", () => {
    const baseline = draftOf([CTRL_A, SHIFT_A, ALT_A], [[SK(0), SK(1), A, A]], { combos: outputs([A]), rules: [rule(0, 3, A)] });
    const run = (draft: SuperkeyDraft) => prepareSuperkeyWrite({ draft, saved: {}, baseline, collect: false, format: "padded" });

    test("an unchanged conflict is a warning", () => {
      const prepared = run(baseline);

      expect(prepared.conflicts).toEqual([]);
      expect(prepared.warnings).toHaveLength(1);
    });

    test.each([
      ["a cell", draftOf(baseline.table, [[SK(0), SK(1), SK(1), A]], { combos: outputs([A]), rules: [rule(0, 3, A)] })],
      ["a combo", draftOf(baseline.table, [[SK(0), SK(1), A, A]], { combos: outputs([SK(1)]), rules: [rule(0, 3, A)] })],
      ["a rule", draftOf(baseline.table, [[SK(0), SK(1), A, A]], { combos: outputs([A]), rules: [rule(0, 3, SK(1))] })],
    ])("one more referencing %s blocks", (_, draft) => {
      expect(run(draft).conflicts).toHaveLength(1);
    });

    describe("rules and combos are known by what they are, not by their index", () => {
      const shared = draftOf([CTRL_A, SHIFT_A], [[SK(0), SK(1)]], { rules: [rule(0, 3, SK(1))], combos: [combo(0, [0, 1], 0, SK(1))] });
      const runShared = (draft: SuperkeyDraft) => prepareSuperkeyWrite({ draft, saved: {}, baseline: shared, collect: false, format: "padded" });

      test("an unrelated rule and combo inserted before the conflict's own still warn", () => {
        const draft = { ...shared, rules: [rule(0, 9, A), ...shared.rules], combos: [combo(0, [7, 8], 0, A), ...shared.combos] };

        const prepared = runShared(draft);

        expect(prepared.conflicts).toEqual([]);
        expect(prepared.warnings).toHaveLength(1);
      });

      test("a rule moved to another key blocks", () => {
        expect(runShared({ ...shared, rules: [rule(0, 4, SK(1))] }).conflicts).toHaveLength(1);
      });

      test("a combo moved to other keys blocks", () => {
        expect(runShared({ ...shared, combos: [combo(0, [0, 2], 0, SK(1))] }).conflicts).toHaveLength(1);
      });
    });

    test("a changed winner blocks", () => {
      const draft = draftOf([ALT_A, SHIFT_A, ALT_A], [[SK(0), SK(1), A, A]], { combos: outputs([A]), rules: [rule(0, 3, A)] });

      expect(run(draft).conflicts).toHaveLength(1);
    });

    test("moving a cell to another definition with the same positions and winner blocks", () => {
      // Swap which key asks for which definition. The positions and the winner stay the same
      const draft = draftOf([CTRL_A, SHIFT_A, ALT_A], [[SK(1), SK(0), A, A]], { combos: outputs([A]), rules: [rule(0, 3, A)] });

      expect(run(draft).conflicts).toHaveLength(1);
    });
  });
});

describe("conflictMessage", () => {
  test("names cells, combos, rules and unused slots", () => {
    const CTRL_A = [0x104, CTRL, 1, 1, 1];
    const SHIFT_A = [0x804, CTRL, 1, 1, 1];
    const ALT_A = [0x204, CTRL, 1, 1, 1];
    const rules = [rule(0, 20, SK(1))];
    const conflict = qukeyCollisions([CTRL_A, SHIFT_A, ALT_A], layout([[SK(0)]], { combos: outputs([A, A, A, SK(1)]), rules }))
      .conflicts[0];

    expect(conflictMessage(conflict, rules)).toBe(
      "Layer 1 key 0, Previous-key tab on Layer 1 key 20, Combo 4 and unused Superkey 3 share one dual-function code on the keyboard, " +
        "so they would all play the same tap and hold. Change one of them.",
    );
  });
});

describe("gcRemovals", () => {
  test("replacing the last reference of a slot removes it", () => {
    const persistedTable = [full(A), full(B)];
    const draft = layout([[SK(0), B]]);

    const removals = gcRemovals({ persistedTable, finalTable: finalGcTable(persistedTable, draft, "padded") });

    expect(removals).toEqual([{ slot: 1, actions: full(B) }]);
  });

  test("an idle slot of the persisted table is never counted as removed", () => {
    const removals = gcRemovals({ persistedTable: [IDLE, full(B)], finalTable: [] });

    expect(removals).toEqual([{ slot: 1, actions: full(B) }]);
  });

  test("a slot only the baseline keymap referenced counts as removed once the draft dropped it", () => {
    const persistedTable = [full(A), full(B), full(A)];
    const draft = draftOf(persistedTable, [[SK(0), A]]);

    const prepared = prepareSuperkeyWrite({ draft, saved: { keymapRefs: [0, 2] }, baseline: null, collect: true, format: "padded" });
    const removals = gcRemovals({ persistedTable, finalTable: finalGcTable(prepared.table, draft, "padded") });

    expect(prepared.table).toEqual([full(A), IDLE, full(A)]);
    expect(removals).toEqual([
      { slot: 1, actions: full(B) },
      { slot: 2, actions: full(A) },
    ]);
  });
});

describe("copies", () => {
  test("cloneSuperkeyRefs gives every occurrence its own slot and turns idle or undefined sources into 0", () => {
    const source = [full(A), IDLE];

    const cloned = cloneSuperkeyRefs([SK(0), SK(0), A, SK(1), SK(9), SK(75)], source, [full(B)], new Set([0]));

    expect(cloned).toEqual({ codes: [SK(1), SK(2), A, 0, 0, 0], table: [full(B), full(A), full(A)], missing: [3, 4, 5] });
  });

  test("cloneSuperkeyRefs changes nothing on capacity", () => {
    const used = new Set(Array.from({ length: 69 }, (_, i) => i));

    expect(cloneSuperkeyRefs([SK(0), SK(0)], [full(A)], [], used)).toEqual({ error: "capacity" });
  });

  test("remapFileSuperkeys gives each file slot one new slot, so the file's sharing stays", () => {
    const file = [full(A), full(B)];

    const remapped = remapFileSuperkeys([[SK(1), SK(0)], [SK(1)], [SK(5)]], file, [full(A)], new Set([0]));

    expect(remapped).toEqual({
      lists: [[SK(1), SK(2)], [SK(1)], [0]],
      table: [full(A), full(B), full(A)],
      missing: [{ list: 2, index: 0 }],
    });
  });

  test("remapFileSuperkeys refuses on capacity", () => {
    const used = new Set(Array.from({ length: 70 }, (_, i) => i));

    expect(remapFileSuperkeys([[SK(0)]], [full(A)], [], used)).toEqual({ error: "capacity" });
  });
});

describe("multiActionBreaks", () => {
  const combos = [combo(0, [0, 1], 1, A), combo(1, [0, 2], 1, A), combo(2, [0, 1], 2, A)];
  const rules = [rule(1, 0, B), rule(1, 0, A), rule(1, 1, A)];

  test("a shared Superkey that stops being a qukey breaks the combos and rules on every cell that uses it", () => {
    const before = { customLayers: [[SK(0), SK(0), A]], table: [tapHold(A, CTRL)], layerOffset: 1 };
    const after = { ...before, table: [full(A)] };

    expect(multiActionBreaks(before, after, combos, rules)).toEqual({
      comboIndexes: [0, 1],
      comboReason: "superkey",
      ruleCount: 3,
      ruleReason: "superkey",
    });
  });

  test("an unchanged cell and a cell that already broke report nothing", () => {
    const before = { customLayers: [[SK(0), A]], table: [full(A)], layerOffset: 1 };
    const after = { ...before, table: [full(B)] };

    expect(multiActionBreaks(before, after, combos, rules)).toEqual({ comboIndexes: [], comboReason: null, ruleCount: 0, ruleReason: null });
  });
});

describe("reconcileDraft", () => {
  test("lists the cells whose saved code differs from the draft", () => {
    expect(
      reconcileDraft(
        [
          [SK(1), A],
          [SK(1), B],
        ],
        [
          [SK(0), A],
          [SK(0), B],
        ],
      ),
    ).toEqual([
      { layer: 0, position: 0, code: SK(0) },
      { layer: 1, position: 0, code: SK(0) },
    ]);
  });
});

describe("dualUseOnlyCode", () => {
  const LAYER_SHIFT_2 = 17451;
  const RIGHT_CTRL = 228;

  test.each([
    [IDLE, 0], // Nothing set
    [[A, 1, 1, 1, 1], A], // Only a tap
    [tapHold(A, CTRL), dualUseCodeFor(A, CTRL)], // Tap and left Ctrl hold
    [tapHold(A, LAYER_SHIFT_2), dualUseCodeFor(A, LAYER_SHIFT_2)], // Tap and layer 2 hold
    [tapHold(A, RIGHT_CTRL), null], // A hold no dual-function code carries
    [[1, CTRL, 1, 1, 1], null], // A hold without a tap
    [[A, 1, B, 1, 1], null], // Tap & hold needs a Superkey
  ])("actions %j give %s", (actions, expected) => {
    expect(dualUseOnlyCode(actions)).toBe(expected);
  });
});

describe("superkeyTapSeed", () => {
  test.each([
    [A, A], // A plain key stays
    [0x2000 | 0x1000 | A, 0x1000 | A], // Shift+A held until layer change becomes Shift+A
    [0x8000 | 0x1100 | A, 0x1100 | A], // Ctrl+Shift+A holding only some modifiers becomes Ctrl+Shift+A
    [54115 + A, A], // Autoshift A becomes A, since the firmware ignores Autoshift a Superkey sends
    [17492, 17492], // Layer lock 1 stays
    [0, 1], // No key leaves Tap empty
    [65535, 1], // Transparent leaves Tap empty
  ])("code %i seeds Tap %i", (code, expected) => {
    expect(superkeyTapSeed(code)).toBe(expected);
  });

  test.each([
    [17450], // Layer shift 1
    [49161], // OneShot layer 1
    [49153], // OneShot left Ctrl
    [54372], // Swap hands while held
    [54112], // Layer Lens key
    [54114], // Hold Layer Lens
  ])("code %i is no Superkey Tap", code => {
    expect(superkeyTapSeed(code)).toBeNull();
  });
});

describe("applyMultiAction with slots the keyboard holds", () => {
  test("a new Superkey skips a defined slot no key references and takes an idle one", () => {
    const table = [full(A), IDLE, full(B)];
    const state = stateOf(table, layout([[A]]), A, { heldSlots: new Set(definedSlots(table)) });

    const result = applyMultiAction(state, cell(0, 0), full(A));

    expect(result).toEqual({ table: [full(A), full(A), full(B)], code: SK(1) });
  });

  test("with every idle slot taken a new Superkey goes past the table end", () => {
    const table = [full(A), full(B)];
    const state = stateOf(table, layout([[A]]), A, { heldSlots: new Set(definedSlots(table)) });

    const result = applyMultiAction(state, cell(0, 0), full(A));

    expect(result).toEqual({ table: [full(A), full(B), full(A)], code: SK(2) });
  });
});

describe("tapSeedRefused", () => {
  test.each([
    [SK(0), false], // A Superkey shows its own actions
    [dualUseCodeFor(A, CTRL), false], // A dual-function key shows its tap and hold
    [A, false], // A plain key seeds Tap
    [54115 + A, false], // Autoshift A seeds its base key
    [17450, true], // Layer shift 1 can't be a Superkey Tap
    [54372, true], // Swap hands while held can't be a Superkey Tap
  ])("code %i gives %s", (code, expected) => {
    expect(tapSeedRefused(code as number)).toBe(expected);
  });
});
