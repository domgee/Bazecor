import { describe, expect, test, vi } from "vitest";
import { dominantBlock, dominantRefreshAction, dominantRefreshStep } from "./dominantCell";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const A = 4;
const SUPERKEY_1 = 53980;

const input = {
  state: "ready" as const,
  keymapKnown: true,
  superkeysFailed: false,
  altRepeatFailed: false,
  holdModsFailed: false,
  cellCode: A,
};

describe("dominantBlock", () => {
  test("a loaded map on a known keymap is editable", () => {
    expect(dominantBlock(input)).toBeUndefined();
  });

  test("an unread keymap blocks edits, so no dominant edit enables a Save that writes a fallback keymap", () => {
    expect(dominantBlock({ ...input, keymapKnown: false })).toBe("The keymap could not be read. Reload to edit dominant layers.");
  });

  test("unread Superkeys block a Superkey cell", () => {
    expect(dominantBlock({ ...input, superkeysFailed: true, cellCode: SUPERKEY_1 })).toBe(
      "The Superkeys could not be read, so this Superkey can't get a dominant layer. Reload to edit it.",
    );
  });

  test("unread Superkeys leave an ordinary key editable", () => {
    expect(dominantBlock({ ...input, superkeysFailed: true })).toBeUndefined();
  });

  test("a failed load says the map could not be read", () => {
    expect(dominantBlock({ ...input, state: "failed" })).toBe("The dominant layers could not be read. Reload to edit them.");
  });
});

describe("dominantRefreshAction", () => {
  test.each([
    [true, "unsupported" as const, "load"], // Support appeared
    [true, "failed" as const, "load"], // The last load failed
    [true, "ready" as const, null], // Unchanged, so an edited draft stays
    [false, "ready" as const, "unsupported"], // Support went away
    [false, "failed" as const, "unsupported"], // Support went away after a failed load
    [false, "unsupported" as const, null], // Unchanged
  ])("listed %s with state %s gives %s", (listed, state, action) => {
    expect(dominantRefreshAction(listed, state)).toBe(action);
  });
});

describe("dominantRefreshStep", () => {
  const step = { refresh: 2, seen: 1, saving: false, listed: true, state: "unsupported" as const };

  test("a new refresh is marked seen and reconciled", () => {
    expect(dominantRefreshStep(step)).toEqual({ seen: 2, action: "load" });
  });

  test("a refresh during a save stays pending, and runs once the save ends", () => {
    const during = dominantRefreshStep({ ...step, saving: true });
    const after = dominantRefreshStep({ ...step, seen: during.seen });

    expect(during).toEqual({ seen: 1, action: null });
    expect(after).toEqual({ seen: 2, action: "load" });
  });

  test("a refresh already seen does nothing", () => {
    expect(dominantRefreshStep({ ...step, seen: 2 })).toEqual({ seen: 2, action: null });
  });
});
