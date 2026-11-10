import { describe, expect, test, vi } from "vitest";
import { COMBO_POSITION_UNUSED, ComboType, MAX_COMBO_MEMBERS, MAX_COMBOS } from "@Renderer/types/combos";
import { comboBadgeLabels, comboBadgeStyles } from "@Renderer/modules/KeyboardCanvas/comboBadges";
import { SuperkeysType } from "@Renderer/types/superkeys";
import { OverlayCodes } from "../../hw/overlay";
import {
  blockedComboPositions,
  comboBreakReason,
  combosAtPosition,
  duplicateComboIndex,
  emptyCombo,
  isLegacyCombosReply,
  overlappingComboIndexes,
  parseCombosRaw,
  parseCombosStrict,
  serializeCombos,
  upgradeLegacyCombosReply,
} from "./combos";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const combo = (id: number, keys: number[], layer: number, action = 29): ComboType => {
  const positions = new Array<number>(MAX_COMBO_MEMBERS).fill(COMBO_POSITION_UNUSED);
  keys.forEach((key, slot) => {
    positions[slot] = key;
  });
  return { id, name: `c${id}`, positions, layer, flags: 1, action };
};

/* A reply the way the firmware sends it: the count, then MAX_COMBOS records. */
const reply = (count: number, records: number[][], fieldsPerRecord: number): string => {
  const values = [count];
  for (let i = 0; i < MAX_COMBOS; i += 1) {
    values.push(...(records[i] ?? new Array<number>(fieldsPerRecord).fill(0)));
  }
  return values.join(" ");
};

describe("combos.map wire format", () => {
  test("a combo has six key slots", () => {
    expect(MAX_COMBO_MEMBERS).toBe(6);
    expect(emptyCombo().positions).toHaveLength(6);
  });

  test("serialises six positions, the layer, flags and action per combo", () => {
    const payload = serializeCombos([combo(0, [48, 49, 50, 51, 52, 53], 2, 29)]);
    const values = payload.split(" ").map(Number);

    expect(values).toHaveLength(1 + MAX_COMBOS * 9);
    expect(values.slice(0, 10)).toEqual([1, 48, 49, 50, 51, 52, 53, 2, 1, 29]);
  });

  test("round-trips through the parser", () => {
    const combos = [combo(0, [48, 49], 0, 29), combo(1, [48, 49, 50, 51, 52, 53], 3, 30)];
    const parsed = parseCombosRaw(serializeCombos(combos), combos);

    expect(parsed).toEqual(combos);
  });

  test("a new combo is created on the layer it is given, never on every layer", () => {
    expect(emptyCombo(0, "x").layer).toBe(0);
    expect(emptyCombo(0, "x", 4).layer).toBe(4);
  });

  test("tells the 4-key reply of the first combos firmware apart", () => {
    const legacy = reply(1, [[48, 49, 255, 255, 255, 1, 29]], 7);
    const current = reply(1, [[48, 49, 255, 255, 255, 255, 0, 1, 29]], 9);

    expect(isLegacyCombosReply(legacy)).toBe(true);
    expect(isLegacyCombosReply(current)).toBe(false);
    expect(isLegacyCombosReply("")).toBe(false);
  });

  test("converts a 4-key backup so it can be restored onto the current firmware", () => {
    const legacy = reply(
      2,
      [
        [48, 49, 50, 255, 255, 1, 29],
        [51, 52, 255, 255, 3, 0, 30],
      ],
      7,
    );

    const upgraded = upgradeLegacyCombosReply(legacy);
    const values = upgraded.split(" ").map(Number);

    expect(values).toHaveLength(1 + MAX_COMBOS * 9);
    expect(isLegacyCombosReply(upgraded)).toBe(false);
    /* "every layer" has no equivalent any more; it lands on layer 0. */
    expect(values.slice(1, 10)).toEqual([48, 49, 50, 255, 255, 255, 0, 1, 29]);
    expect(values.slice(10, 19)).toEqual([51, 52, 255, 255, 255, 255, 3, 0, 30]);

    const parsed = parseCombosRaw(upgraded);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].layer).toBe(3);
  });

  test("leaves a current-format reply untouched", () => {
    const current = reply(1, [[48, 49, 255, 255, 255, 255, 0, 1, 29]], 9);

    expect(upgradeLegacyCombosReply(current)).toBe(current);
  });
});

describe("keys shared between combos", () => {
  test("a subset of a longer combo is allowed and is not a duplicate", () => {
    const combos = [combo(0, [48, 49], 0), combo(1, [48, 49, 50], 0)];

    expect(duplicateComboIndex(combos, 0)).toBe(-1);
    expect(duplicateComboIndex(combos, 1)).toBe(-1);
    expect(overlappingComboIndexes(combos, 0)).toEqual([1]);
  });

  test("the same keys on the same layer are a duplicate, in any order", () => {
    const combos = [combo(0, [48, 49, 50], 1), combo(1, [50, 48, 49], 1)];

    expect(duplicateComboIndex(combos, 1)).toBe(0);
    expect(duplicateComboIndex(combos, 0)).toBe(1);
  });

  test("the same keys on another layer are not a duplicate", () => {
    const combos = [combo(0, [48, 49], 0), combo(1, [48, 49], 1)];

    expect(duplicateComboIndex(combos, 1)).toBe(-1);
    expect(overlappingComboIndexes(combos, 1)).toEqual([]);
  });

  test("an empty combo duplicates nothing", () => {
    const combos = [emptyCombo(0), emptyCombo(1)];

    expect(duplicateComboIndex(combos, 0)).toBe(-1);
  });
});

describe("combos per layer", () => {
  const combos = [combo(0, [48, 49], 0), combo(1, [49, 50], 0), combo(2, [48, 49], 1)];

  test("combosAtPosition only returns combos on that layer", () => {
    expect(combosAtPosition(combos, 49, 0)).toEqual([0, 1]);
    expect(combosAtPosition(combos, 49, 1)).toEqual([2]);
    expect(combosAtPosition(combos, 49, 2)).toEqual([]);
  });

  test("255 is no longer 'every layer'", () => {
    expect(combosAtPosition([combo(0, [48, 49], 255)], 48, 0)).toEqual([]);
  });

  test("badges show every combo a key is in, for the layer shown", () => {
    const labels = comboBadgeLabels(combos, 0);

    expect(labels.get(48)).toBe("C1");
    expect(labels.get(49)).toBe("C1 C2");
    expect(labels.get(50)).toBe("C2");
    expect(comboBadgeLabels(combos, 1).get(49)).toBe("C3");
  });

  test("one badge rule per key, so a shared key does not lose a combo", () => {
    const rules = comboBadgeStyles(combos, 0).split("\n");

    expect(rules).toHaveLength(3);
    expect(rules.filter(rule => rule.includes('"C1 C2"'))).toHaveLength(1);
  });
});

describe("combo member blocking", () => {
  test("Layer Lens keys and complex superkeys are blocked, Qukey-type superkeys and plain keys are not", () => {
    const superkeys: SuperkeysType[] = [
      { id: 0, name: "complex", actions: [4, 5, 6, 0, 0] },
      // TAP a, HOLD Left Ctrl, so the firmware runs it as a Qukey
      { id: 1, name: "qukey", actions: [4, 224, 0, 0, 0] },
    ];
    const keyCodes = [
      53980, // complex superkey
      53981, // Qukey-type superkey
      OverlayCodes.OVERLAY_KEY,
      OverlayCodes.OVERLAY_TAP,
      OverlayCodes.OVERLAY_HOLD,
      4, // a
      undefined, // empty position
    ];

    const blockedPositions = blockedComboPositions(keyCodes, superkeys);

    expect(blockedPositions).toEqual(new Set([0, 2, 3, 4]));
  });

  test.each([
    [54372, "swaphands"], // Swap while held
    [54375, "swaphands"], // One-shot
    [54420, "swaphands"], // Swap hands, Space on tap
    [54371, null], // CapsWord
  ])("comboBreakReason(%i) is %s", (keyCode, expected) => {
    expect(comboBreakReason(keyCode)).toBe(expected);
  });

  test("a swap hands key is blocked as a member", () => {
    expect(blockedComboPositions([4, 54372, 5])).toEqual(new Set([1]));
  });
});

describe("parseCombosStrict", () => {
  const record = [48, 49, 255, 255, 255, 255, 2, 1, 29];

  test("reads the firmware's fixed-size reply", () => {
    expect(parseCombosStrict(reply(1, [record], 9), [combo(0, [], 0)])).toEqual([
      { id: 0, name: "c0", positions: [48, 49, 255, 255, 255, 255], layer: 2, flags: 1, action: 29 },
    ]);
  });

  test("reads a reply of exactly the count's records", () => {
    expect(parseCombosStrict(`1 ${record.join(" ")}`)).toHaveLength(1);
    expect(parseCombosStrict("0")).toEqual([]);
  });

  test("ignores the unused records of a fixed-size reply", () => {
    const values = reply(1, [record], 9).split(" ");
    values[values.length - 1] = "65535";

    expect(parseCombosStrict(values.join(" "))).toHaveLength(1);
  });

  test.each([
    ["an Error", new Error("timeout")],
    ["an empty reply", ""],
    ["a truncated reply", reply(1, [record], 9).split(" ").slice(0, 100).join(" ")],
    ["a non-numeric token", `1 ${record.slice(0, 8).join(" ")} x`],
    ["a count past 32", `33 ${record.join(" ")}`],
    ["a position past 255", `1 256 ${record.slice(1).join(" ")}`],
    ["an action past 65535", `1 ${record.slice(0, 8).join(" ")} 65536`],
    ["a legacy reply", reply(1, [[48, 49, 255, 255, 255, 1, 29]], 7)],
  ])("returns null for %s", (_, raw) => {
    expect(parseCombosStrict(raw)).toBeNull();
  });
});
