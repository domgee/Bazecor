import { describe, expect, test } from "vitest";

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
} from "./previewReads";

const OPTIONS_OFF = "0 0 0 0 0 0 0";

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
});
