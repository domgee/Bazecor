import { describe, expect, test, vi } from "vitest";
import { ALT_REPEAT_COMMAND } from "../parsers/altRepeat";
import { KEY_OVERRIDES_COMMAND } from "../parsers/keyOverrides";
import { QUICK_TAP_COMMAND } from "../parsers/quickTap";
import { CONDITIONAL_LAYERS_COMMAND } from "../parsers/conditionalLayers";
import { DUAL_FUNCTION_COMMAND, PER_KEY_COMMAND } from "../parsers/dualFunction";
import { MACROS_COMMAND, MACROS_NOT_RESTORED } from "../parsers/macros";
import { HOLD_MODS_COMMAND, HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED } from "../parsers/holdMods";
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

    await restoreCommand(device, KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1", () => 60, sendPlain, "unlisted");

    expect(noCacheCommand.mock.calls).toEqual([[KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1"], [KEY_OVERRIDES_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("validates previous-key rules and reads them back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, ALT_REPEAT_COMMAND, "1 0 23 6 14", () => 60, sendPlain, "unlisted");

    expect(noCacheCommand.mock.calls).toEqual([[ALT_REPEAT_COMMAND, "1 0 23 6 14"], [ALT_REPEAT_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("validates conditional layers and reads them back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, CONDITIONAL_LAYERS_COMMAND, "1 6 3", () => 60, sendPlain, "unlisted");

    expect(noCacheCommand.mock.calls).toEqual([[CONDITIONAL_LAYERS_COMMAND, "1 6 3"], [CONDITIONAL_LAYERS_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard replies error to the conditional layers write", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(
      restoreCommand({ noCacheCommand }, CONDITIONAL_LAYERS_COMMAND, "1 6 3", () => 60, vi.fn(), "unlisted"),
    ).rejects.toThrow("rejected");
  });

  test("sends every other command plain, once, without reading the layout", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");
    const keysPerLayer = vi.fn(() => 60);

    await restoreCommand(device, "keymap.custom", "1 2 3", keysPerLayer, sendPlain, "unlisted");

    expect(sendPlain).toHaveBeenCalledTimes(1);
    expect(noCacheCommand).not.toHaveBeenCalled();
    expect(keysPerLayer).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard keeps its old key overrides", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(
      restoreCommand({ noCacheCommand }, KEY_OVERRIDES_COMMAND, "1 42 8 1023 0 8 76 7 1", () => 60, vi.fn(), "unlisted"),
    ).rejects.toThrow();
  });

  test("rejects when a plain send fails", async () => {
    const { device } = mockDevice();
    const sendPlain = vi.fn(async () => {
      throw new Error("port closed");
    });

    await expect(restoreCommand(device, "keymap.custom", "1 2 3", () => 60, sendPlain, "unlisted")).rejects.toThrow(
      "port closed",
    );
  });

  test("validates the quick tap term and reads it back, with no plain send", async () => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, QUICK_TAP_COMMAND, "120", () => 60, sendPlain, "unlisted");

    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test("rejects when the keyboard replies error to the quick tap write", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn(), "unlisted")).rejects.toThrow(
      "rejected",
    );
  });

  test("rejects when the quick tap write returns an Error", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn(), "unlisted")).rejects.toThrow(
      "timeout",
    );
  });

  test("rejects when the quick tap read-back differs", async () => {
    /* Accept the write but keep the stored 0 */
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, "120", () => 60, vi.fn(), "unlisted")).rejects.toThrow(
      "did not store",
    );
  });

  test.each([
    ["a fraction", " 1.5 "],
    ["a term above 1000", "1001"],
  ])("rejects %s from a virtual backup without sending anything", async (_, data) => {
    const noCacheCommand = vi.fn();
    const sendPlain = vi.fn();

    await expect(restoreCommand({ noCacheCommand }, QUICK_TAP_COMMAND, data, () => 60, sendPlain, "unlisted")).rejects.toThrow(
      "Malformed",
    );
    expect(noCacheCommand).not.toHaveBeenCalled();
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test.each([
    [DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"],
    [PER_KEY_COMMAND, "1 8 250 65535 255 3 3 3 3"],
  ])("validates %s and reads it back, with no plain send", async (command, data) => {
    const { device, noCacheCommand } = mockDevice();
    const sendPlain = vi.fn(async () => "");

    await restoreCommand(device, command, data, () => 60, sendPlain, "unlisted");

    expect(noCacheCommand.mock.calls).toEqual([[command, data], [command]]);
    expect(sendPlain).not.toHaveBeenCalled();
  });

  test.each([
    [DUAL_FUNCTION_COMMAND, "1 1 1 1 120 1 109"],
    [PER_KEY_COMMAND, "1 8 250 65535 255 3 3 3 3"],
  ])("rejects when the keyboard replies error to the %s write", async (command, data) => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "error" : "0"));

    await expect(restoreCommand({ noCacheCommand }, command, data, () => 60, vi.fn(), "unlisted")).rejects.toThrow("rejected");
  });

  test.each([
    [DUAL_FUNCTION_COMMAND, "0 0 0 0 0 0 222"],
    [PER_KEY_COMMAND, "1 52 65535 65535 255 1 3 3 3"],
  ])("rejects a malformed %s entry without sending anything", async (command, data) => {
    const noCacheCommand = vi.fn();
    const sendPlain = vi.fn();

    await expect(restoreCommand({ noCacheCommand }, command, data, () => 60, sendPlain, "unlisted")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
    expect(sendPlain).not.toHaveBeenCalled();
  });

  describe("macros.map", () => {
    const LEGACY = "8 4 0 0";
    const UPGRADED = "14 140 8 4 15 16 195 169 0 0";

    const helpDevice = (help: unknown) => {
      const noCacheCommand = vi.fn(async (): Promise<unknown> => help);
      return { device: { noCacheCommand }, noCacheCommand };
    };

    test("sends legacy macros plain without reading help", async () => {
      const { device, noCacheCommand } = helpDevice("macros.map");
      const sendPlain = vi.fn(async () => "");

      const warning = await restoreCommand(device, MACROS_COMMAND, LEGACY, () => 60, sendPlain, "unlisted");

      expect(warning).toBeUndefined();
      expect(sendPlain).toHaveBeenCalledTimes(1);
      expect(noCacheCommand).not.toHaveBeenCalled();
    });

    test("sends new steps plain when help lists the marker", async () => {
      const { device, noCacheCommand } = helpDevice("macros.map\r\nmacros.state");
      const sendPlain = vi.fn(async () => "");

      const warning = await restoreCommand(device, MACROS_COMMAND, UPGRADED, () => 60, sendPlain, "unlisted");

      expect(warning).toBeUndefined();
      expect(sendPlain).toHaveBeenCalledTimes(1);
      expect(noCacheCommand.mock.calls).toEqual([["help"]]);
    });

    test("skips new steps and returns a warning when help lacks the marker", async () => {
      const { device } = helpDevice("macros.map\r\nmacros.memory");
      const sendPlain = vi.fn(async () => "");

      const warning = await restoreCommand(device, MACROS_COMMAND, UPGRADED, () => 60, sendPlain, "unlisted");

      expect(warning).toBe(MACROS_NOT_RESTORED);
      expect(sendPlain).not.toHaveBeenCalled();
    });

    describe("with the layer off marker", () => {
      const LAYER_OFF = "14 140 6 227 8 43 17 7 227 0 0";

      /* A keyboard that replies help and macros.steps */
      const stepsDevice = (help: string) => {
        const noCacheCommand = vi.fn(async (cmd: string): Promise<unknown> => (cmd === "help" ? help : "17"));
        return { device: { noCacheCommand }, noCacheCommand };
      };

      test("skips it and returns a warning when help lists the marker but not macros.steps", async () => {
        const { device, noCacheCommand } = stepsDevice("macros.map\r\nmacros.state");
        const sendPlain = vi.fn(async () => "");

        const warning = await restoreCommand(device, MACROS_COMMAND, LAYER_OFF, () => 60, sendPlain, "unlisted");

        expect(warning).toBe(MACROS_NOT_RESTORED);
        expect(sendPlain).not.toHaveBeenCalled();
        expect(noCacheCommand.mock.calls).toEqual([["help"]]);
      });

      test("sends it plain when macros.steps replies 17", async () => {
        const { device, noCacheCommand } = stepsDevice("macros.map\r\nmacros.state\r\nmacros.steps");
        const sendPlain = vi.fn(async () => "");

        const warning = await restoreCommand(device, MACROS_COMMAND, LAYER_OFF, () => 60, sendPlain, "unlisted");

        expect(warning).toBeUndefined();
        expect(sendPlain).toHaveBeenCalledTimes(1);
        expect(noCacheCommand.mock.calls).toEqual([["help"], ["macros.steps"]]);
      });

      test("steps up to 16 do not read macros.steps", async () => {
        const { device, noCacheCommand } = stepsDevice("macros.map\r\nmacros.state\r\nmacros.steps");
        const sendPlain = vi.fn(async () => "");

        const warning = await restoreCommand(device, MACROS_COMMAND, UPGRADED, () => 60, sendPlain, "unlisted");

        expect(warning).toBeUndefined();
        expect(sendPlain).toHaveBeenCalledTimes(1);
        expect(noCacheCommand.mock.calls).toEqual([["help"]]);
      });
    });

    test.each([
      ["returns an Error", async (): Promise<unknown> => new Error("timeout")],
      [
        "throws",
        async (): Promise<unknown> => {
          throw new Error("port closed");
        },
      ],
    ])("counts a help read that %s as no marker", async (_, reply) => {
      const sendPlain = vi.fn(async () => "");

      const warning = await restoreCommand(
        { noCacheCommand: vi.fn(reply) },
        MACROS_COMMAND,
        UPGRADED,
        () => 60,
        sendPlain,
        "unlisted",
      );

      expect(warning).toBe(MACROS_NOT_RESTORED);
      expect(sendPlain).not.toHaveBeenCalled();
    });
  });

  describe("partial layer holds", () => {
    // Cmd+Shift+Tab with Cmd held, its plain shortcut and its legacy all-held form
    const PARTIAL = 0x982b;
    const PLAIN = 0x182b;
    const LEGACY = 0x382b;

    test("validates the held modifiers and reads them back on a target that lists them", async () => {
      const { device, noCacheCommand } = mockDevice();
      const sendPlain = vi.fn();

      const warning = await restoreCommand(device, HOLD_MODS_COMMAND, `1 ${PARTIAL} 16`, () => 60, sendPlain, "listed");

      expect(warning).toBeUndefined();
      expect(noCacheCommand.mock.calls).toEqual([[HOLD_MODS_COMMAND, `1 ${PARTIAL} 16`], [HOLD_MODS_COMMAND]]);
      expect(sendPlain).not.toHaveBeenCalled();
    });

    test.each([["unlisted"], ["unreadable"]] as const)(
      "skips the held modifiers with a warning on an %s target",
      async target => {
        const { device, noCacheCommand } = mockDevice();
        const sendPlain = vi.fn();

        const warning = await restoreCommand(device, HOLD_MODS_COMMAND, `1 ${PARTIAL} 16`, () => 60, sendPlain, target);

        expect(warning).toBe(HOLD_MODS_NOT_RESTORED);
        expect(noCacheCommand).not.toHaveBeenCalled();
        expect(sendPlain).not.toHaveBeenCalled();
      },
    );

    test("writes the keymap with its partial holds uncached on a target that lists the table", async () => {
      const { device, noCacheCommand } = mockDevice();
      const sendPlain = vi.fn();

      const warning = await restoreCommand(device, "keymap.custom", `41 ${PARTIAL}`, () => 60, sendPlain, "listed");

      expect(warning).toBeUndefined();
      expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", `41 ${PARTIAL}`]]);
      expect(sendPlain).not.toHaveBeenCalled();
    });

    test.each([
      ["returns an Error", new Error("timeout"), "timeout"],
      ["returns undefined", undefined, "answer"],
    ])("rejects when the keymap write %s on a target that lists the table", async (_, written, message) => {
      const noCacheCommand = vi.fn(
        async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? written : "0"),
      );

      await expect(restoreCommand({ noCacheCommand }, "keymap.custom", "41 42", () => 60, vi.fn(), "listed")).rejects.toThrow(
        message,
      );
    });

    test.each([["unlisted"], ["unreadable"]] as const)(
      "makes partial holds in the keymap plain on an %s target",
      async target => {
        const { device, noCacheCommand } = mockDevice();
        const sendPlain = vi.fn();

        const warning = await restoreCommand(device, "keymap.custom", `41 ${PARTIAL} ${LEGACY}`, () => 60, sendPlain, target);

        expect(warning).toBe(HOLD_MODS_NORMALIZED);
        expect(noCacheCommand.mock.calls).toEqual([["keymap.custom", `41 ${PLAIN} ${LEGACY}`]]);
        expect(sendPlain).not.toHaveBeenCalled();
      },
    );

    test.each([["unlisted"], ["unreadable"]] as const)("makes partial hold outputs plain on an %s target", async target => {
      const { device, noCacheCommand } = mockDevice();

      const warning = await restoreCommand(device, ALT_REPEAT_COMMAND, `1 2 23 ${PLAIN} ${PARTIAL}`, () => 60, vi.fn(), target);

      expect(warning).toBe(HOLD_MODS_NORMALIZED);
      expect(noCacheCommand.mock.calls).toEqual([[ALT_REPEAT_COMMAND, `1 2 23 ${PLAIN} ${PLAIN}`], [ALT_REPEAT_COMMAND]]);
    });

    test("keeps partial hold outputs on a target that lists the table", async () => {
      const { device, noCacheCommand } = mockDevice();

      const warning = await restoreCommand(device, ALT_REPEAT_COMMAND, `1 2 23 ${PLAIN} ${PARTIAL}`, () => 60, vi.fn(), "listed");

      expect(warning).toBeUndefined();
      expect(noCacheCommand.mock.calls).toEqual([[ALT_REPEAT_COMMAND, `1 2 23 ${PLAIN} ${PARTIAL}`], [ALT_REPEAT_COMMAND]]);
    });
  });
});
