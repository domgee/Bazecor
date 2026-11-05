import { describe, expect, test, vi } from "vitest";
import { ALT_REPEAT_COMMAND } from "../parsers/altRepeat";
import { KEY_OVERRIDES_COMMAND } from "../parsers/keyOverrides";
import { QUICK_TAP_COMMAND } from "../parsers/quickTap";
import restoreCommand from "./restoreCommand";

/* A keyboard that stores each table it is sent and replies with it */
const mockDevice = () => {
  const tables: Record<string, string> = {};
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      tables[cmd] = args.join(" ");
      return "";
    }

    return tables[cmd] ?? "0";
  });
  return { device: { noCacheCommand }, noCacheCommand };
};

describe("restoreCommand", () => {
  test("validates key overrides and reads them back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1", () => 60, sendPlain);

    expect(noCacheCommand.mock.calls).toEqual([[KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1"], [KEY_OVERRIDES_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("validates previous-key rules and reads them back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, ALT_REPEAT_COMMAND, "1 0 23 6 14", () => 60, sendPlain);

    expect(noCacheCommand.mock.calls).toEqual([[ALT_REPEAT_COMMAND, "1 0 23 6 14"], [ALT_REPEAT_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("sends every other command plain, once, without reading the layout", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");
    const keysPerLayer = vi.fn(() => 60);

    await restoreCommand(device, "keymap.custom", "1 2 3", keysPerLayer, sendPlain);

    expect(sendPlain).toHaveBeenCalledTimes(1);
    expect(noCacheCommand).not.toHaveBeenCalled();
    expect(keysPerLayer).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard keeps its old key overrides", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(
      restoreCommand({ noCacheCommand }, KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1", () => 60, vi.fn()),
    ).rejects.toThrow();
  });

  test("rejects when a plain send fails", async () => {
    const { device } = mockDevice();
    const sendPlain = vi.fn(async () => {
      throw new Error("port closed");
    });

    await expect(restoreCommand(device, "keymap.custom", "1 2 3", () => 60, sendPlain)).rejects.toThrow("port closed");
  });

  test("validates the quick tap term and reads it back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, QUICK_TAP_COMMAND, "120", () => 60, sendPlain);

    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard keeps its old quick tap term", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn())).rejects.toThrow();
  });

  test("rejects when the quick tap write returns an Error", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn())).rejects.toThrow("timeout");
  });

  test("rejects when the quick tap read-back differs", async () => {
    /* Accept the write but keep the stored 0 */
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn())).rejects.toThrow();
  });

  test.each([
    ["a fraction", " 1.5 "],
    ["a term above 1000", "1001"],
  ])("rejects %s from a virtual backup and keeps the stored term", async (_, data) => {
    /* Store and echo the args, as Device.virtualRequest does */
    const tables: Record<string, string> = { [QUICK_TAP_COMMAND]: "0" };
    const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
      if (args.length > 0) {
        tables[cmd] = args.join(" ");
      }

      return tables[cmd];
    });
    const sendPlain = vi.fn(async () => "");

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, data, () => 60, sendPlain)).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
    expect(sendPlain).not.toHaveBeenCalled();
    expect(tables[QUICK_TAP_COMMAND]).toBe("0");
  });
});
