import { describe, expect, test, vi } from "vitest";

import {
  BackupSkippedError,
  HOLD_TIMEOUT_COMMAND,
  PRIOR_INTERVAL_COMMAND,
  firstUnreadable,
  isPreviewReadable,
  parseGlobalNumber,
  previewCommands,
  readGlobalNumber,
  rereadPreviews,
  unreadableBeforeBackup,
} from "./previewReads";

const OPTIONS_OFF = "0 0 0 0 0 0 0";

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

describe("preview reads", () => {
  test("list every preview command, with quick tap only when the firmware has it", () => {
    expect(previewCommands(true)).toEqual([
      "qukeys.holdTimeout",
      "qukeys.minimumPriorInterval",
      "qukeys.quickTapTerm",
      "qukeys.dualFunction",
    ]);
    expect(previewCommands(false)).toEqual(["qukeys.holdTimeout", "qukeys.minimumPriorInterval", "qukeys.dualFunction"]);
  });

  test("parse a number reply and reject anything else", () => {
    expect(parseGlobalNumber("250\r\n")).toBe(250);
    expect(parseGlobalNumber("")).toBeNull();
    expect(parseGlobalNumber("error")).toBeNull();
    expect(parseGlobalNumber(new Error("timeout"))).toBeNull();
    expect(parseGlobalNumber(undefined)).toBeNull();
  });

  test.each([
    ["qukeys.holdTimeout", "250", true],
    ["qukeys.minimumPriorInterval", "75", true],
    ["qukeys.quickTapTerm", "120", true],
    ["qukeys.quickTapTerm", "5000", false], // above the quick tap maximum
    ["qukeys.dualFunction", OPTIONS_OFF, true],
    ["qukeys.dualFunction", "0 0 0", false], // too few fields
    ["qukeys.holdTimeout", "", false],
  ])("judge the %s reply %j readable: %s", (command, raw, readable) => {
    expect(isPreviewReadable(command, raw)).toBe(readable);
  });

  test("give null when every reply can be used", () => {
    expect(
      firstUnreadable([
        { command: HOLD_TIMEOUT_COMMAND, raw: "250" },
        { command: PRIOR_INTERVAL_COMMAND, raw: "75" },
        { command: "qukeys.dualFunction", raw: OPTIONS_OFF },
      ]),
    ).toBeNull();
  });

  test("give the first command whose reply can not be used", () => {
    expect(
      firstUnreadable([
        { command: HOLD_TIMEOUT_COMMAND, raw: "250" },
        { command: PRIOR_INTERVAL_COMMAND, raw: new Error("timeout") },
        { command: "qukeys.dualFunction", raw: "" },
      ]),
    ).toBe(PRIOR_INTERVAL_COMMAND);
  });

  test("read a global number once more after a failed reply", async () => {
    const replies: unknown[] = [new Error("timeout"), "250"];
    const sent: string[] = [];
    const device = {
      noCacheCommand: async (command: string) => {
        sent.push(command);
        return replies.shift();
      },
    };

    const value = await readGlobalNumber(device, HOLD_TIMEOUT_COMMAND);

    expect(value).toBe(250);
    expect(sent).toEqual([HOLD_TIMEOUT_COMMAND, HOLD_TIMEOUT_COMMAND]);
  });

  test("give null for a global number that fails twice", async () => {
    const device = { noCacheCommand: async () => "" };

    expect(await readGlobalNumber(device, PRIOR_INTERVAL_COMMAND)).toBeNull();
  });

  test("reread every preview uncached and give the first one still unreadable", async () => {
    const replies: Record<string, unknown> = {
      "qukeys.holdTimeout": "250",
      "qukeys.minimumPriorInterval": "75",
      "qukeys.quickTapTerm": "error",
      "qukeys.dualFunction": "",
    };
    const sent: string[] = [];
    const device = {
      noCacheCommand: async (command: string) => {
        sent.push(command);
        return replies[command];
      },
    };

    const unreadable = await rereadPreviews(device, true);

    expect(unreadable).toBe("qukeys.quickTapTerm");
    expect(sent).toEqual(["qukeys.holdTimeout", "qukeys.minimumPriorInterval", "qukeys.quickTapTerm", "qukeys.dualFunction"]);
  });

  test("give null when every reread preview is readable", async () => {
    const replies: Record<string, unknown> = {
      "qukeys.holdTimeout": "250",
      "qukeys.minimumPriorInterval": "75",
      "qukeys.dualFunction": OPTIONS_OFF,
    };
    const device = { noCacheCommand: async (command: string) => replies[command] };

    expect(await rereadPreviews(device, false)).toBeNull();
  });

  test("name the unreadable command in a skipped backup", () => {
    const error = new BackupSkippedError("qukeys.holdTimeout");

    expect(error).toBeInstanceOf(Error);
    expect(error.command).toBe("qukeys.holdTimeout");
    expect(error.message).toBe("qukeys.holdTimeout could not be read");
  });

  describe("unreadableBeforeBackup", () => {
    const READABLE: Record<string, unknown> = {
      "qukeys.holdTimeout": "250",
      "qukeys.minimumPriorInterval": "75",
      "qukeys.dualFunction": OPTIONS_OFF,
      "qukeys.perKey": "0",
    };

    const deviceWith = (replies: Record<string, unknown>) => {
      const sent: string[] = [];
      const device = {
        noCacheCommand: async (command: string) => {
          sent.push(command);
          return replies[command];
        },
      };

      return { device, sent };
    };

    test("block the backup while qukeys.perKey, whose load failed, still can not be read", async () => {
      const { device, sent } = deviceWith({ ...READABLE, "qukeys.perKey": new Error("timeout") });

      const unreadable = await unreadableBeforeBackup(device, { previews: true, hasQuickTap: false, perKey: true });

      expect(unreadable).toBe("qukeys.perKey");
      expect(sent).toEqual(["qukeys.holdTimeout", "qukeys.minimumPriorInterval", "qukeys.dualFunction", "qukeys.perKey"]);
    });

    test("let the backup run once qukeys.perKey reads again", async () => {
      const { device } = deviceWith(READABLE);

      expect(await unreadableBeforeBackup(device, { previews: true, hasQuickTap: false, perKey: true })).toBeNull();
    });

    test("name an unreadable preview before qukeys.perKey", async () => {
      const { device, sent } = deviceWith({ ...READABLE, "qukeys.holdTimeout": "", "qukeys.perKey": "" });

      const unreadable = await unreadableBeforeBackup(device, { previews: true, hasQuickTap: false, perKey: true });

      expect(unreadable).toBe("qukeys.holdTimeout");
      expect(sent).not.toContain("qukeys.perKey");
    });

    test("read nothing when neither the previews nor qukeys.perKey need it", async () => {
      const { device, sent } = deviceWith({});

      expect(await unreadableBeforeBackup(device, { previews: false, hasQuickTap: true, perKey: false })).toBeNull();
      expect(sent).toEqual([]);
    });

    test("block the backup while superkeys.map fails twice", async () => {
      const { device, sent } = deviceWith({ "superkeys.map": new Error("timeout") });

      const unreadable = await unreadableBeforeBackup(device, { previews: false, hasQuickTap: false, perKey: false, superkeys: true });

      expect(unreadable).toBe("superkeys.map");
      expect(sent).toEqual(["superkeys.map", "superkeys.map"]);
    });

    test("let the backup run when superkeys.map reads on the retry", async () => {
      let calls = 0;
      const device = {
        noCacheCommand: async () => {
          calls += 1;
          return calls === 1 ? new Error("timeout") : "4 224 5 1 1 0 65535";
        },
      };

      expect(await unreadableBeforeBackup(device, { previews: false, hasQuickTap: false, perKey: false, superkeys: true })).toBeNull();
      expect(calls).toBe(2);
    });

    test("block the backup while led.custom fails twice", async () => {
      const { device, sent } = deviceWith({ "led.custom": "error" });

      const unreadable = await unreadableBeforeBackup(device, { previews: false, hasQuickTap: false, perKey: false, ledCustom: true });

      expect(unreadable).toBe("led.custom");
      expect(sent).toEqual(["led.custom", "led.custom"]);
    });

    test("let the backup run when led.custom reads", async () => {
      const { device, sent } = deviceWith({ "led.custom": "1 5 0 0 0 0" });

      expect(await unreadableBeforeBackup(device, { previews: false, hasQuickTap: false, perKey: false, ledCustom: true })).toBeNull();
      expect(sent).toEqual(["led.custom"]);
    });

    test("read only qukeys.perKey when only its load failed", async () => {
      const { device, sent } = deviceWith(READABLE);

      expect(await unreadableBeforeBackup(device, { previews: false, hasQuickTap: false, perKey: true })).toBeNull();
      expect(sent).toEqual(["qukeys.perKey"]);
    });
  });
});
