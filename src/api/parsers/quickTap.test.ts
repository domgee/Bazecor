import { describe, expect, test, vi } from "vitest";
import {
  QUICK_TAP_COMMAND,
  QuickTapDevice,
  hasQuickTapCommand,
  isValidQuickTapTerm,
  needsQuickTapClear,
  parseQuickTapTerm,
  readQuickTapTerm,
  restoreQuickTap,
  writeQuickTapTerm,
} from "./quickTap";

/* A keyboard that stores the term it is sent, or replies `error` to every write when it rejects */
const fakeDevice = (initial = "0", reject = false) => {
  let term = initial;
  const noCacheCommand = vi.fn(async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (cmd !== QUICK_TAP_COMMAND) {
      return "";
    }

    if (args.length > 0) {
      if (reject) {
        return "error";
      }

      term = args.join(" ");
      return "";
    }

    return term;
  });
  const device: QuickTapDevice = { noCacheCommand };
  return { device, noCacheCommand };
};

describe("hasQuickTapCommand", () => {
  test("finds the exact command line in help", () => {
    expect(hasQuickTapCommand("version\r\nqukeys.quickTapTerm\r\nhelp")).toBe(true);
    expect(hasQuickTapCommand("version\n  qukeys.quickTapTerm  \nhelp")).toBe(true);
  });

  test("rejects a non-string, an absent line and a line that only contains the command", () => {
    expect(hasQuickTapCommand(undefined)).toBe(false);
    expect(hasQuickTapCommand(new Error("timeout"))).toBe(false);
    expect(hasQuickTapCommand("version\r\nqukeys.holdTimeout\r\nhelp")).toBe(false);
    expect(hasQuickTapCommand("qukeys.quickTapTermX")).toBe(false);
    expect(hasQuickTapCommand("xqukeys.quickTapTerm")).toBe(false);
  });
});

describe("parseQuickTapTerm", () => {
  test("reads a decimal term from 0 to 1000", () => {
    expect(parseQuickTapTerm("0")).toBe(0);
    expect(parseQuickTapTerm("120")).toBe(120);
    expect(parseQuickTapTerm(" 120\r\n")).toBe(120);
    expect(parseQuickTapTerm("1000")).toBe(1000);
  });

  test.each([
    ["1001", "1001"], // above the firmware's maximum
    ["an empty reply", ""],
    ["text", "abc"],
    ["two numbers", "12 3"],
    ["a negative number", "-1"],
    ["a fraction", "1.5"],
    ["an Error", new Error("timeout")],
    ["undefined", undefined],
  ])("returns null for %s", (_, raw) => {
    expect(parseQuickTapTerm(raw)).toBeNull();
  });
});

describe("isValidQuickTapTerm", () => {
  test("accepts integers from 0 to 1000", () => {
    expect(isValidQuickTapTerm(0)).toBe(true);
    expect(isValidQuickTapTerm(1000)).toBe(true);
  });

  test.each([
    ["-1", -1],
    ["1001", 1001],
    ["1.5", 1.5],
    ["NaN", NaN],
    ["a numeric string", "5"],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_, value) => {
    expect(isValidQuickTapTerm(value)).toBe(false);
  });
});

describe("needsQuickTapClear", () => {
  test("clears only when the keyboard has the command and the backup lacks it", () => {
    const supported = new Set(["keymap.custom", QUICK_TAP_COMMAND]);

    expect(needsQuickTapClear(["keymap.custom"], supported)).toBe(true);
    expect(needsQuickTapClear(["keymap.custom", QUICK_TAP_COMMAND], supported)).toBe(false);
    expect(needsQuickTapClear(["keymap.custom"], new Set(["keymap.custom"]))).toBe(false);
    expect(needsQuickTapClear(["keymap.custom"], null)).toBe(false);
  });
});

describe("readQuickTapTerm", () => {
  test("reads the term", async () => {
    const { device } = fakeDevice("120");

    expect(await readQuickTapTerm(device)).toBe(120);
  });

  test("returns null on an Error reply, a thrown error or an error reply", async () => {
    expect(await readQuickTapTerm({ noCacheCommand: async () => new Error("timeout") })).toBeNull();
    expect(
      await readQuickTapTerm({
        noCacheCommand: async () => {
          throw new Error("closed");
        },
      }),
    ).toBeNull();
    expect(await readQuickTapTerm({ noCacheCommand: async () => "error" })).toBeNull();
  });
});

describe("writeQuickTapTerm", () => {
  test("writes the term, then reads it back uncached", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await writeQuickTapTerm(device, 120);

    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
  });

  test("turns quick tap off with 0", async () => {
    const { device, noCacheCommand } = fakeDevice("120");

    await writeQuickTapTerm(device, 0);

    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "0"], [QUICK_TAP_COMMAND]]);
  });

  test("rejects an invalid term without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(writeQuickTapTerm(device, 1001)).rejects.toThrow();
    await expect(writeQuickTapTerm(device, -1)).rejects.toThrow();
    await expect(writeQuickTapTerm(device, 1.5)).rejects.toThrow();
    expect(noCacheCommand).not.toHaveBeenCalled();
  });

  test("rejects the firmware's error reply and reads the kept term back into the cache", async () => {
    const { device, noCacheCommand } = fakeDevice("80", true);

    await expect(writeQuickTapTerm(device, 120)).rejects.toThrow("rejected");
    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
    expect(await noCacheCommand.mock.results[1].value).toBe("80");
  });

  test("rejects an Error reply to the write", async () => {
    const noCacheCommand = vi.fn(
      async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? new Error("timeout") : "0"),
    );

    await expect(writeQuickTapTerm({ noCacheCommand }, 120)).rejects.toThrow("timeout");
    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
  });

  test("rejects a read-back that differs from the term sent", async () => {
    const noCacheCommand = vi.fn(async (_cmd: string, ...args: string[]): Promise<unknown> => (args.length > 0 ? "" : "0"));

    await expect(writeQuickTapTerm({ noCacheCommand }, 120)).rejects.toThrow("did not store");
  });
});

describe("restoreQuickTap", () => {
  test("writes a valid entry and reads it back", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await restoreQuickTap(device, " 120 ");

    expect(noCacheCommand.mock.calls).toEqual([[QUICK_TAP_COMMAND, "120"], [QUICK_TAP_COMMAND]]);
  });

  test("rejects a malformed entry without sending anything", async () => {
    const { device, noCacheCommand } = fakeDevice();

    await expect(restoreQuickTap(device, "abc")).rejects.toThrow("Malformed");
    expect(noCacheCommand).not.toHaveBeenCalled();
  });
});
