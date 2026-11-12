import { describe, expect, test, vi } from "vitest";
import { AltRepeatRule } from "@Renderer/types/altRepeat";
import { COMBO_POSITION_UNUSED, ComboType, MAX_COMBO_MEMBERS } from "@Renderer/types/combos";
import { SuperkeyDraft } from "../../../api/parsers/multiAction";
import {
  KEY_SWAP_ROOT_CLASS,
  SWAP_LIST_COMPACT,
  SWAP_LIST_MAX,
  SwapInput,
  SwapSuperkeyInput,
  keyRectsUnion,
  keySwapStyles,
  nonEmptyLayers,
  planSwap,
  rulesSupportUnknown,
  swapCells,
  swapListAnchor,
  swapRules,
} from "./keySwap";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const SK = (slot: number) => 53980 + slot;
const A = 4;
const B = 5;
const C = 6;
const CTRL = 224;
const TRANSPARENT = 65535;
// Five actions, so the key is a Superkey that can't be a combo member on legacy firmware
const full = (tap: number) => [tap, CTRL, B, 1, 1];
// Two Superkeys that legacy firmware stores under one qukey code
const CTRL_A = [0x104, CTRL, 1, 1, 1];
const SHIFT_A = [0x804, CTRL, 1, 1, 1];

const rule = (layer: number, position: number, output: number, previous = A): AltRepeatRule => ({
  layer,
  position,
  previous,
  output,
});

const combo = (index: number, positions: number[], layer: number): ComboType => {
  const members = new Array<number>(MAX_COMBO_MEMBERS).fill(COMBO_POSITION_UNUSED);
  positions.forEach((position, i) => {
    members[i] = position;
  });
  return { id: index, name: "", positions: members, action: A, layer, flags: 1 } as ComboType;
};

describe("swapCells", () => {
  test("exchanges two cells on one layer and copies only that layer", () => {
    const layers = [
      [1, 2, 3],
      [4, 5, 6],
    ];

    const swapped = swapCells(layers, { layer: 0, position: 0 }, { layer: 0, position: 2 });

    expect(swapped).toEqual([
      [3, 2, 1],
      [4, 5, 6],
    ]);
    expect(swapped[1]).toBe(layers[1]);
    expect(layers[0]).toEqual([1, 2, 3]);
  });

  test("exchanges cells across layers and keeps the other layers", () => {
    const layers = [
      [1, 2],
      [3, 4],
      [5, 6],
    ];

    const swapped = swapCells(layers, { layer: 0, position: 1 }, { layer: 2, position: 0 });

    expect(swapped).toEqual([
      [1, 5],
      [3, 4],
      [2, 6],
    ]);
    expect(swapped[1]).toBe(layers[1]);
    expect(layers).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  test.each([
    [
      { layer: 0, position: 1 },
      { layer: 0, position: 1 },
    ], // same cell
    [
      { layer: 0, position: 1 },
      { layer: 3, position: 0 },
    ], // missing layer
    [
      { layer: 0, position: 5 },
      { layer: 1, position: 0 },
    ], // position past the end
    [
      { layer: 0, position: -1 },
      { layer: 1, position: 0 },
    ], // negative position
  ])("returns the input for %o and %o", (a, b) => {
    const layers = [
      [1, 2],
      [3, 4],
    ];

    expect(swapCells(layers, a, b)).toBe(layers);
  });
});

describe("swapRules", () => {
  test("moves the tabs of each cell to the other and keeps order and untouched rules", () => {
    const untouched = rule(0, 9, B);
    const rules = [rule(0, 1, B), untouched, rule(2, 3, C), rule(2, 3, B, C)];

    const moved = swapRules(rules, { layer: 0, position: 1 }, { layer: 2, position: 3 });

    expect(moved).toEqual([rule(2, 3, B), untouched, rule(0, 1, C), rule(0, 1, B, C)]);
    expect(moved[1]).toBe(untouched);
    expect(rules[0]).toEqual(rule(0, 1, B));
  });

  test("returns the input when neither cell has tabs", () => {
    const rules = [rule(0, 9, B)];

    expect(swapRules(rules, { layer: 0, position: 1 }, { layer: 1, position: 1 })).toBe(rules);
  });

  test("returns the input for the same cell", () => {
    const rules = [rule(0, 1, B)];

    expect(swapRules(rules, { layer: 0, position: 1 }, { layer: 0, position: 1 })).toBe(rules);
  });
});

describe("nonEmptyLayers", () => {
  test("lists layers with a key other than NoKey or Transparent, plus the source, by firmware id", () => {
    const custom = [
      [0, TRANSPARENT],
      [0, A],
      [TRANSPARENT, TRANSPARENT],
      [B, 0],
    ];

    expect(nonEmptyLayers(custom, 2, 4)).toEqual([3, 4, 5]);
  });

  test("keeps the source once when it is not empty", () => {
    expect(nonEmptyLayers([[A], [0]], 0, 0)).toEqual([0]);
  });
});

describe("rulesSupportUnknown", () => {
  test.each([
    ["unsupported", "loading", true, true],
    ["unsupported", "loading", false, false], // not a Sonsei
    ["unsupported", "ready", true, false],
    ["ready", "loading", true, false],
  ] as const)("altRepeat %s, holdMods %s, Sonsei %s gives %s", (altRepeat, holdMods, isSonsei, expected) => {
    expect(rulesSupportUnknown(altRepeat, holdMods, isSonsei)).toBe(expected);
  });
});

describe("keyRectsUnion", () => {
  test("takes the highest top and rightmost edge of the drawn keys", () => {
    const rects = [
      { top: 100, right: 300, width: 40, height: 40 },
      { top: 80, right: 500, width: 40, height: 40 },
      { top: 10, right: 900, width: 0, height: 0 },
    ];

    expect(keyRectsUnion(rects)).toEqual({ top: 80, right: 500 });
  });

  test("is null without drawn keys", () => {
    expect(keyRectsUnion([{ top: 0, right: 0, width: 0, height: 10 }])).toBeNull();
  });
});

describe("swapListAnchor", () => {
  const viewport = { width: 1200, height: 800 };

  test("places a full list right of the keys in a wide window", () => {
    expect(swapListAnchor({ top: 150, right: 700 }, viewport)).toEqual({
      top: 150,
      left: 712,
      width: SWAP_LIST_MAX,
      maxHeight: 638,
      compact: false,
    });
  });

  test("narrows the list to the room there is", () => {
    expect(swapListAnchor({ top: 150, right: 976 }, viewport)).toEqual({
      top: 150,
      left: 988,
      width: 200,
      maxHeight: 638,
      compact: false,
    });
  });

  test("goes compact when a full list does not fit", () => {
    expect(swapListAnchor({ top: 150, right: 1076 }, viewport)).toEqual({
      top: 150,
      left: 1088,
      width: 100,
      maxHeight: 638,
      compact: true,
    });
  });

  test("overlaps the rightmost keys when even a compact list does not fit", () => {
    expect(swapListAnchor({ top: 150, right: 1150 }, viewport)).toEqual({
      top: 150,
      left: 1200 - SWAP_LIST_COMPACT - 12,
      width: SWAP_LIST_COMPACT,
      maxHeight: 638,
      compact: true,
    });
  });

  test("keeps the list on screen and at least 160 px tall", () => {
    expect(swapListAnchor({ top: 790, right: 700 }, viewport)).toMatchObject({ top: 640, maxHeight: 148 });
    expect(swapListAnchor({ top: -20, right: 700 }, viewport)).toMatchObject({ top: 12, maxHeight: 776 });
  });
});

describe("keySwapStyles", () => {
  const source = { layer: 1, position: 4 };

  test("is empty without a drag", () => {
    expect(keySwapStyles(null, 1, { layer: 1, position: 2 })).toBe("");
  });

  test("dims the source on its layer and outlines the hovered key", () => {
    expect(keySwapStyles(source, 1, { layer: 1, position: 2 }).split("\n")).toEqual([
      `html.${KEY_SWAP_ROOT_CLASS}, html.${KEY_SWAP_ROOT_CLASS} * { cursor: grabbing !important; }`,
      '.layoutEditor .keyItem[data-layer="1"][data-key-index="4"] { opacity: 0.45; }',
      '.layoutEditor .keyItem[data-layer="1"][data-key-index="2"] { filter: drop-shadow(0 0 6px rgb(120, 121, 241)); }',
    ]);
  });

  test("leaves the source alone on another layer and skips the outline on the source itself", () => {
    expect(keySwapStyles(source, 2, { layer: 2, position: 4 })).not.toContain("opacity");
    expect(keySwapStyles(source, 1, source)).not.toContain("drop-shadow");
  });
});

describe("planSwap", () => {
  const input = (extra: Partial<SwapInput> = {}): SwapInput => ({
    custom: [
      [A, B, C],
      [C, A, 0],
    ],
    rules: [],
    from: { layer: 0, position: 0 },
    to: { layer: 1, position: 2 },
    layerOffset: 0,
    combos: [],
    table: [],
    unique: false,
    repeatKeyRules: false,
    repeatTapRules: false,
    ...extra,
  });

  const superkeysFor = (custom: number[][], table: number[][], extra: Partial<SwapSuperkeyInput> = {}): SwapSuperkeyInput => {
    const baseline: SuperkeyDraft = { customLayers: custom, defaultLayers: [], layerOffset: 0, rules: [], combos: [], table };
    return {
      refs: { defaultLayers: [], combos: [] },
      saved: {},
      baseline,
      collect: false,
      format: "padded",
      mode: "legacy",
      ...extra,
    };
  };

  test("swaps across layers by firmware layer", () => {
    const plan = planSwap(
      input({
        layerOffset: 2,
        from: { layer: 2, position: 0 },
        to: { layer: 3, position: 2 },
      }),
    );

    expect(plan).toMatchObject({
      kind: "swap",
      after: [
        [0, B, C],
        [C, A, A],
      ],
      a: { layer: 0, position: 0 },
      b: { layer: 1, position: 2 },
      breaks: { comboIndexes: [], comboReason: null, ruleCount: 0 },
    });
  });

  test("swaps on one layer", () => {
    const plan = planSwap(input({ to: { layer: 0, position: 2 } }));

    expect(plan).toMatchObject({
      kind: "swap",
      after: [
        [C, B, A],
        [C, A, 0],
      ],
    });
  });

  test("refuses a cell that does not exist", () => {
    expect(planSwap(input({ to: { layer: 5, position: 0 } }))).toEqual({ kind: "refused", reason: "missing", conflicts: [] });
  });

  test("does nothing on the same cell", () => {
    expect(planSwap(input({ to: { layer: 0, position: 0 } }))).toEqual({ kind: "noop" });
  });

  test("does nothing for equal codes without tabs", () => {
    expect(planSwap(input({ to: { layer: 1, position: 1 } }))).toEqual({ kind: "noop" });
  });

  test("swaps equal codes whose tabs differ", () => {
    const rules = [rule(0, 0, B)];

    const plan = planSwap(input({ to: { layer: 1, position: 1 }, rules }));

    expect(plan).toMatchObject({ kind: "swap", movedRules: [rule(1, 1, B)] });
  });

  test("reports the combos the swap breaks at either cell", () => {
    const custom = [
      [A, B, C],
      [C, SK(0), 0],
    ];
    const combos = [combo(0, [0, 1], 0), combo(1, [1, 2], 1)];

    const fromSuperkey = planSwap(
      input({ custom, combos, table: [full(A)], from: { layer: 1, position: 1 }, to: { layer: 0, position: 0 } }),
    );
    const toSuperkey = planSwap(
      input({ custom, combos, table: [full(A)], from: { layer: 0, position: 0 }, to: { layer: 1, position: 1 } }),
    );

    // Combo 1 already can't fire with the Superkey, so only combo 0 breaks
    expect(fromSuperkey).toMatchObject({ kind: "swap", breaks: { comboIndexes: [0], comboReason: "superkey" } });
    expect(toSuperkey).toMatchObject({ kind: "swap", breaks: { comboIndexes: [0], comboReason: "superkey" } });
  });

  test("moves tabs onto a Transparent key without counting them as broken", () => {
    const custom = [[A, TRANSPARENT]];
    const rules = [rule(0, 0, B)];

    const plan = planSwap(input({ custom, rules, to: { layer: 0, position: 1 } }));

    expect(plan).toMatchObject({ kind: "swap", movedRules: [rule(0, 1, B)], breaks: { ruleCount: 0, ruleReason: null } });
  });

  test("does not refuse an unused collider that Save collects", () => {
    const custom = [[SK(1), A]];
    const superkeys = superkeysFor(custom, [SHIFT_A, CTRL_A], { baseline: null, collect: true });

    const plan = planSwap(input({ custom, table: [SHIFT_A, CTRL_A], to: { layer: 0, position: 1 }, superkeys }));

    expect(plan.kind).toBe("swap");
  });

  test("does not refuse a move of a key in a clash that blocks Save already", () => {
    const custom = [[SK(1), A, B]];
    const superkeys = superkeysFor(custom, [SHIFT_A, CTRL_A], { baseline: null, saved: { keymapRefs: [0] } });

    const plan = planSwap(input({ custom, table: [SHIFT_A, CTRL_A], to: { layer: 0, position: 1 }, superkeys }));

    expect(plan.kind).toBe("swap");
  });

  describe("two members of a clash already on the keyboard", () => {
    const custom = [[SK(0), SK(1), A]];
    const table = [CTRL_A, SHIFT_A];
    const swapMembers = (mode: SwapSuperkeyInput["mode"]) =>
      planSwap(input({ custom, table, to: { layer: 0, position: 1 }, superkeys: superkeysFor(custom, table, { mode }) }));

    test("refuses the swap on legacy firmware, since Save would refuse the changed clash", () => {
      const plan = swapMembers("legacy");

      expect(plan).toMatchObject({ kind: "refused", reason: "conflict" });
      expect(plan.kind === "refused" && plan.conflicts).toHaveLength(1);
    });

    test("refuses the swap while the mode is unknown", () => {
      expect(swapMembers("unknown")).toEqual({ kind: "refused", reason: "modeUnknown", conflicts: [] });
    });

    test("swaps on unique firmware", () => {
      expect(swapMembers("unique").kind).toBe("swap");
    });

    test("lets an unrelated key move", () => {
      const plan = planSwap(
        input({
          custom: [[SK(0), SK(1), A, B]],
          table,
          from: { layer: 0, position: 2 },
          to: { layer: 0, position: 3 },
          superkeys: superkeysFor([[SK(0), SK(1), A, B]], table),
        }),
      );

      expect(plan.kind).toBe("swap");
    });
  });
});
