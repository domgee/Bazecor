import { describe, expect, test, vi } from "vitest";
import { readKeymapReplies } from "./comboSave";
import { collectBlock, gcInputsKnown } from "./preGcGate";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const CTRL = 224;
// Five actions, so the firmware runs it as a Superkey
const full = (tap: number) => [tap, CTRL, 5, 1, 1];

const base = {
  ready: true,
  isVirtual: false,
  readsOk: true,
  persistedTable: [full(4), full(6)],
};

describe("collectBlock", () => {
  test.each([
    [{ readsOk: false }, "unreadable"], // previews or superkeys.map unreadable
    [{ persistedTable: null }, "tableUnknown"], // unknown persisted table
    [{ isVirtual: true }, "virtual"], // virtual keyboard
    [{ ready: false }, "notReady"], // Superkeys, combos, rules or keymap replies unread
    [{}, null], // every check passes
  ])("%o gives %o", (change, expected) => {
    expect(collectBlock({ ...base, ...change })).toBe(expected);
  });
});

describe("gcInputsKnown", () => {
  test("PartialDefaultLayerReply_NoGc", () => {
    // Two keys per layer, and the default reply stops before the second layer's Superkey reference
    const replies = readKeymapReplies({ custom: "53980 4", defaults: "4 5 53981", onlyCustom: "0" }, 2);

    const ready = gcInputsKnown({ combos: "ready", keymapKnown: replies !== null });

    expect(replies).toBeNull();
    expect(collectBlock({ ...base, ready })).toBe("notReady");
  });

  test("UnreadCombos_NoGc", () => {
    expect(gcInputsKnown({ combos: "failed", keymapKnown: true })).toBe(false);
  });

  test("CombosUnsupportedAndKeymapKnown_Gc", () => {
    expect(gcInputsKnown({ combos: "unsupported", keymapKnown: true })).toBe(true);
  });
});
