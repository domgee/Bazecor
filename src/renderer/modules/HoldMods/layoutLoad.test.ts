import { describe, expect, test, vi } from "vitest";
import { loadHoldModsForEditor } from "./layoutLoad";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const PARTIAL = 0x982b;
const GUI = 16;
const HELP = "keymap.custom\r\nlayerhold.state\r\nholdmods.map\r\naltrepeat.map";

/* A keyboard that answers uncached reads from `replies`. A function reply runs, so it can throw. Cached reads return a stale keymap */
const mockDevice = (replies: Record<string, unknown>) => {
  const noCacheCommand = vi.fn(async (cmd: string): Promise<unknown> => {
    const reply = replies[cmd];
    return typeof reply === "function" ? reply() : reply;
  });
  const command = vi.fn(async (): Promise<unknown> => "1 2 3");
  return { device: { noCacheCommand, command }, noCacheCommand, command };
};

const sonsei = (overrides: Record<string, unknown> = {}) =>
  mockDevice({
    help: HELP,
    "holdmods.map": `1 ${PARTIAL} ${GUI}`,
    "keymap.custom": `41 ${PARTIAL}\r\n65535`,
    "keymap.onlyCustom": "1",
    "altrepeat.map": `1 1 0 6 ${PARTIAL}`,
    ...overrides,
  });

describe("loadHoldModsForEditor", () => {
  test("another product is unsupported without a help read", async () => {
    const { device, noCacheCommand } = sonsei();

    const load = await loadHoldModsForEditor(device, "Defy");

    expect(load).toEqual({ state: "unsupported", table: [], helpListsAltRepeat: false });
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test.each([
    [
      () => {
        throw new Error("timeout");
      },
    ], // Throws
    [new Error("timeout")], // Device returns the failed request
    [undefined], // Closed port
    [""], // Empty reply
  ])("an unreadable help keeps it loading, so Save stays on and a later load retries, %j", async help => {
    const { device, noCacheCommand } = sonsei({ help });

    const load = await loadHoldModsForEditor(device, "Sonsei");

    expect(load).toEqual({ state: "loading", table: [], helpListsAltRepeat: false });
    expect(noCacheCommand.mock.calls).toEqual([["help"]]);
  });

  test("help without the table is unsupported", async () => {
    const { device } = sonsei({ help: "keymap.custom\r\nlayerhold.state\r\naltrepeat.map" });

    expect(await loadHoldModsForEditor(device, "Sonsei")).toEqual({ state: "unsupported", table: [], helpListsAltRepeat: true });
  });

  test("a table that could not be read failed", async () => {
    const { device } = sonsei({ "holdmods.map": "garbage" });

    expect(await loadHoldModsForEditor(device, "Sonsei")).toEqual({ state: "failed", table: [], helpListsAltRepeat: true });
  });

  test("a readable table is ready with the keymap and rules read uncached", async () => {
    const { device, noCacheCommand, command } = sonsei();

    const load = await loadHoldModsForEditor(device, "Sonsei");

    expect(load).toEqual({
      state: "ready",
      table: [{ code: PARTIAL, held: GUI }],
      helpListsAltRepeat: true,
      baseline: {
        keymap: `41 ${PARTIAL} 65535|1`,
        keymapCodes: [41, PARTIAL, 65535],
        ruleRefs: [{ layer: 1, position: 0, previous: 6, output: PARTIAL }],
      },
    });
    expect(noCacheCommand.mock.calls).toEqual([
      ["help"],
      ["holdmods.map"],
      ["keymap.custom"],
      ["keymap.onlyCustom"],
      ["altrepeat.map"],
    ]);
    // Device caches the arguments of a failed write, so a cached read may return a keymap the keyboard never stored
    expect(command).not.toHaveBeenCalled();
  });

  test("firmware without rules has none to protect", async () => {
    const { device, noCacheCommand } = sonsei({ help: "holdmods.map" });

    const load = await loadHoldModsForEditor(device, "Sonsei");

    expect(load.baseline?.ruleRefs).toEqual([]);
    expect(noCacheCommand).not.toHaveBeenCalledWith("altrepeat.map");
  });

  test.each([
    ["keymap.custom", new Error("timeout")],
    ["keymap.custom", "41 x"],
    ["keymap.onlyCustom", undefined],
    ["altrepeat.map", "2 1"],
  ])("an unreadable %s keeps it loading, so the protections stay", async (cmd, reply) => {
    const { device } = sonsei({ [cmd]: reply });

    expect(await loadHoldModsForEditor(device, "Sonsei")).toEqual({ state: "loading", table: [], helpListsAltRepeat: true });
  });
});
