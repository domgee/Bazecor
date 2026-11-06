import { describe, expect, test, vi } from "vitest";
import Backup from "./Backup";
import Device from "../comms/Device";

vi.mock("electron", () => ({ ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: vi.fn() } }));

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../renderer/utils/Store", () => ({
  default: { getStore: () => ({ get: vi.fn(), set: vi.fn() }) },
}));

/* Stand in for the serial device, whose module graph needs the native serial port */
vi.mock("../comms/Device", () => ({ default: class {} }));

describe("Backup.Commands", () => {
  test("leaves out the read-only state markers and keeps the configuration", async () => {
    const device = { command: async () => "keymap.custom\r\nswaphands.state\r\nlayerhold.state\r\nqukeys.holdTimeout" } as unknown as Device;

    const commands = await Backup.Commands(device);

    expect(commands).toContain("keymap.custom");
    expect(commands).toContain("qukeys.holdTimeout");
    expect(commands).not.toContain("swaphands.state");
    expect(commands).not.toContain("layerhold.state");
  });

  test("leaves out the macro state and keeps the macros", async () => {
    const device = { command: async () => "macros.map\r\nmacros.state\r\nmacros.memory" } as unknown as Device;

    const commands = await Backup.Commands(device);

    expect(commands).toContain("macros.map");
    expect(commands).not.toContain("macros.state");
  });
});

/* A Sonsei that stores each command it is sent and replies with it, as the firmware with the dual-function commands does */
const sonsei = (stored: Record<string, string>) => {
  const keyboard: Record<string, string> = {
    help: "keymap.custom\r\nqukeys.dualFunction\r\nqukeys.perKey",
    "keymap.custom": "0",
    ...stored,
  };
  const reply = async (cmd: string, ...args: string[]): Promise<unknown> => {
    if (args.length > 0) {
      keyboard[cmd] = args.join(" ");
      return "";
    }

    return keyboard[cmd] ?? "";
  };
  const noCacheCommand = vi.fn(reply);
  const device = {
    device: { info: { product: "Sonsei" }, keyboard: { rows: 5, columns: 12 } },
    noCacheCommand,
    command: vi.fn(reply),
  } as unknown as Device;
  return { device, keyboard, noCacheCommand };
};

const SET_OPTIONS = "2 1 1 0 100 1 109";
const SET_TABLE = "1 8 250 65535 255 3 3 3 3";
const BACKUP_OPTIONS = "1 0 0 0 0 1 0";
const BACKUP_TABLE = "1 40 65535 65535 255 1 3 3 3";

describe("Backup restore of the dual-function options", () => {
  test("restoreBackup turns the options off and clears the table for a backup that predates them", async () => {
    const { device, keyboard } = sonsei({ "qukeys.dualFunction": SET_OPTIONS, "qukeys.perKey": SET_TABLE });

    const restored = await Backup.restoreBackup([], "neuron", [{ command: "keymap.custom", data: "1" }] as never, device);

    expect(restored).toBe(true);
    expect(keyboard["qukeys.dualFunction"]).toBe("0 0 0 0 0 0 0");
    expect(keyboard["qukeys.perKey"]).toBe("0");
  });

  test("restoreBackup restores the backup's options and table and clears nothing", async () => {
    const { device, keyboard, noCacheCommand } = sonsei({ "qukeys.dualFunction": SET_OPTIONS, "qukeys.perKey": SET_TABLE });
    const backup = [
      { command: "keymap.custom", data: "1" },
      { command: "qukeys.dualFunction", data: BACKUP_OPTIONS },
      { command: "qukeys.perKey", data: BACKUP_TABLE },
    ];

    const restored = await Backup.restoreBackup([], "neuron", backup as never, device);

    expect(restored).toBe(true);
    expect(keyboard["qukeys.dualFunction"]).toBe(BACKUP_OPTIONS);
    expect(keyboard["qukeys.perKey"]).toBe(BACKUP_TABLE);
    expect(noCacheCommand.mock.calls.filter(call => call.length > 1).map(call => call[0])).toEqual([
      "qukeys.dualFunction",
      "qukeys.perKey",
    ]);
  });

  test("restoreVirtual turns the options off and clears the table for a file that predates them", async () => {
    const { device, keyboard } = sonsei({ "qukeys.dualFunction": SET_OPTIONS, "qukeys.perKey": SET_TABLE });
    const virtual = { device: { info: { product: "Sonsei" } }, virtual: { "keymap.custom": { data: "1", eraseable: true } } };

    const restored = await Backup.restoreVirtual(virtual as never, device);

    expect(restored).toBe(true);
    expect(keyboard["qukeys.dualFunction"]).toBe("0 0 0 0 0 0 0");
    expect(keyboard["qukeys.perKey"]).toBe("0");
  });

  test("restoreVirtual restores the file's options and table and clears nothing", async () => {
    const { device, keyboard, noCacheCommand } = sonsei({ "qukeys.dualFunction": SET_OPTIONS, "qukeys.perKey": SET_TABLE });
    const virtual = {
      device: { info: { product: "Sonsei" } },
      virtual: {
        "keymap.custom": { data: "1", eraseable: true },
        "qukeys.dualFunction": { data: BACKUP_OPTIONS, eraseable: true },
        "qukeys.perKey": { data: BACKUP_TABLE, eraseable: true },
      },
    };

    const restored = await Backup.restoreVirtual(virtual as never, device);

    expect(restored).toBe(true);
    expect(keyboard["qukeys.dualFunction"]).toBe(BACKUP_OPTIONS);
    expect(keyboard["qukeys.perKey"]).toBe(BACKUP_TABLE);
    expect(noCacheCommand.mock.calls.filter(call => call.length > 1).map(call => call[0])).toEqual([
      "qukeys.dualFunction",
      "qukeys.perKey",
    ]);
  });
});
