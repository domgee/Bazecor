import { describe, expect, test, vi } from "vitest";
import Backup from "./Backup";
import Device from "../comms/Device";
import { MACROS_NOT_RESTORED } from "../parsers/macros";
import { HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED } from "../parsers/holdMods";

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
    const device = {
      command: async () => "keymap.custom\r\nswaphands.state\r\nlayerhold.state\r\nqukeys.holdTimeout",
    } as unknown as Device;

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

  test("keeps the held modifiers of partial layer holds", async () => {
    const device = { command: async () => "keymap.custom\r\nlayerhold.state\r\nholdmods.map" } as unknown as Device;

    const commands = await Backup.Commands(device);

    expect(commands).toContain("holdmods.map");
  });

  test("leaves out the macro step limit", async () => {
    const device = { command: async () => "macros.map\r\nmacros.state\r\nmacros.steps" } as unknown as Device;

    const commands = await Backup.Commands(device);

    expect(commands).toContain("macros.map");
    expect(commands).not.toContain("macros.steps");
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

describe("Backup restore of macros with new steps", () => {
  const HELP = "keymap.custom\r\nmacros.map\r\nqukeys.dualFunction\r\nqukeys.perKey";
  const UPGRADED = "14 140 8 4 0 0";
  const LAYER_OFF = "14 140 8 4 17 0 0";
  const ON_KEYBOARD = "8 5 0 0";

  test("restoreBackup skips only macros.map without the marker and collects one warning", async () => {
    const { device, keyboard } = sonsei({ help: HELP, "macros.map": ON_KEYBOARD });
    const backup = [
      { command: "keymap.custom", data: "1 2 3" },
      { command: "macros.map", data: UPGRADED },
    ];

    const restored = await Backup.restoreBackup([], "neuron", backup as never, device);

    expect(restored).toBe(true);
    expect(keyboard["keymap.custom"]).toBe("1 2 3");
    expect(keyboard["macros.map"]).toBe(ON_KEYBOARD);
    expect(Backup.takeRestoreWarnings()).toEqual([MACROS_NOT_RESTORED]);
  });

  test("restoreVirtual skips only macros.map without the marker and collects one warning", async () => {
    const { device, keyboard } = sonsei({ help: HELP, "macros.map": ON_KEYBOARD });
    const virtual = {
      device: { info: { product: "Sonsei" } },
      virtual: {
        "keymap.custom": { data: "1 2 3", eraseable: true },
        "macros.map": { data: UPGRADED, eraseable: true },
      },
    };

    const restored = await Backup.restoreVirtual(virtual as never, device);

    expect(restored).toBe(true);
    expect(keyboard["keymap.custom"]).toBe("1 2 3");
    expect(keyboard["macros.map"]).toBe(ON_KEYBOARD);
    expect(Backup.takeRestoreWarnings()).toEqual([MACROS_NOT_RESTORED]);
  });

  test("restoreBackup sends the macros when help lists the marker", async () => {
    const { device, keyboard } = sonsei({ help: `${HELP}\r\nmacros.state`, "macros.map": ON_KEYBOARD });

    await Backup.restoreBackup([], "neuron", [{ command: "macros.map", data: UPGRADED }] as never, device);

    expect(keyboard["macros.map"]).toBe(UPGRADED);
    expect(Backup.takeRestoreWarnings()).toEqual([]);
  });

  test("restoreBackup skips a layer off marker on firmware with the marker alone", async () => {
    const { device, keyboard } = sonsei({ help: `${HELP}\r\nmacros.state`, "macros.map": ON_KEYBOARD });

    await Backup.restoreBackup([], "neuron", [{ command: "macros.map", data: LAYER_OFF }] as never, device);

    expect(keyboard["macros.map"]).toBe(ON_KEYBOARD);
    expect(Backup.takeRestoreWarnings()).toEqual([MACROS_NOT_RESTORED]);
  });

  test("restoreBackup sends a layer off marker when macros.steps replies 17", async () => {
    const { device, keyboard } = sonsei({
      help: `${HELP}\r\nmacros.state\r\nmacros.steps`,
      "macros.steps": "17",
      "macros.map": ON_KEYBOARD,
    });

    await Backup.restoreBackup([], "neuron", [{ command: "macros.map", data: LAYER_OFF }] as never, device);

    expect(keyboard["macros.map"]).toBe(LAYER_OFF);
    expect(Backup.takeRestoreWarnings()).toEqual([]);
  });
});

describe("Backup restore of partial layer holds", () => {
  // Cmd+Shift+Tab with Cmd held, and its plain shortcut
  const PARTIAL = 0x982b;
  const PLAIN = 0x182b;
  const HELP = "keymap.custom\r\naltrepeat.map\r\nholdmods.map";
  const OLD_TABLE = `1 ${PARTIAL} 8`;
  const TABLE = `1 ${PARTIAL} 16`;
  const KEYMAP = `41 ${PARTIAL}`;
  const RULES = `1 2 23 ${PLAIN} ${PARTIAL}`;

  /* A Sonsei that logs every write. `help` replies in turn and repeats the last one. `failWrite` makes that command's write return an Error */
  const holdSonsei = ({ help = [HELP], failWrite }: { help?: unknown[]; failWrite?: string } = {}) => {
    const keyboard: Record<string, string> = { "keymap.custom": "0", "altrepeat.map": "0", "holdmods.map": OLD_TABLE };
    const helpReplies = [...help];
    const writes: string[][] = [];
    const reply = async (cmd: string, ...args: string[]): Promise<unknown> => {
      if (cmd === "help") {
        return helpReplies.length > 1 ? helpReplies.shift() : helpReplies[0];
      }

      if (args.length === 0) {
        return keyboard[cmd] ?? "";
      }

      writes.push([cmd, args.join(" ")]);

      if (cmd === failWrite) {
        return new Error("timeout");
      }

      keyboard[cmd] = args.join(" ");
      return "";
    };
    const device = {
      device: { info: { product: "Sonsei" }, keyboard: { rows: 5, columns: 12 } },
      noCacheCommand: vi.fn(reply),
      command: vi.fn(reply),
    } as unknown as Device;
    return { device, keyboard, writes };
  };

  const restoreBoth = [
    [
      "restoreBackup",
      (device: Device, entries: { command: string; data: string }[]) =>
        Backup.restoreBackup([], "neuron", entries as never, device),
    ],
    [
      "restoreVirtual",
      (device: Device, entries: { command: string; data: string }[]) =>
        Backup.restoreVirtual(
          {
            device: { info: { product: "Sonsei" } },
            virtual: Object.fromEntries(entries.map(e => [e.command, { data: e.data, eraseable: true }])),
          } as never,
          device,
        ),
    ],
  ] as const;

  test.each(restoreBoth)(
    "%s empties the table first and installs the backup's table after the loop and the rule clear",
    async (_, restore) => {
      const { device, keyboard, writes } = holdSonsei();

      // The table comes before the keymap in the backup, and the backup has no rules
      const restored = await restore(device, [
        { command: "holdmods.map", data: TABLE },
        { command: "keymap.custom", data: KEYMAP },
      ]);

      expect(restored).toBe(true);
      expect(writes).toEqual([
        ["holdmods.map", "0"],
        ["keymap.custom", KEYMAP],
        ["altrepeat.map", "0"],
        ["holdmods.map", TABLE],
      ]);
      expect(keyboard["holdmods.map"]).toBe(TABLE);
      expect(Backup.takeRestoreWarnings()).toEqual([]);
    },
  );

  test.each(restoreBoth)("%s leaves the table empty when it fails before the rules are replaced", async (_, restore) => {
    const { device, keyboard, writes } = holdSonsei({ failWrite: "altrepeat.map" });

    const restored = await restore(device, [
      { command: "holdmods.map", data: TABLE },
      { command: "keymap.custom", data: KEYMAP },
      { command: "altrepeat.map", data: RULES },
    ]);

    expect(restored).toBe(false);
    expect(writes).toEqual([
      ["holdmods.map", "0"],
      ["keymap.custom", KEYMAP],
      ["altrepeat.map", RULES],
    ]);
    expect(keyboard["holdmods.map"]).toBe("0");
  });

  test.each(restoreBoth)("%s stops before the table when the keymap write returns an Error", async (_, restore) => {
    const { device, keyboard, writes } = holdSonsei({ failWrite: "keymap.custom" });

    const restored = await restore(device, [
      { command: "keymap.custom", data: KEYMAP },
      { command: "holdmods.map", data: TABLE },
    ]);

    expect(restored).toBe(false);
    expect(writes).toEqual([
      ["holdmods.map", "0"],
      ["keymap.custom", KEYMAP],
    ]);
    expect(keyboard["holdmods.map"]).toBe("0");
  });

  test.each(restoreBoth)("%s leaves the table empty for a backup without one", async (_, restore) => {
    const { device, keyboard } = holdSonsei();

    const restored = await restore(device, [
      { command: "keymap.custom", data: KEYMAP },
      { command: "altrepeat.map", data: RULES },
    ]);

    expect(restored).toBe(true);
    expect(keyboard["holdmods.map"]).toBe("0");
    expect(keyboard["altrepeat.map"]).toBe(RULES);
  });

  test.each(restoreBoth)("%s makes partial holds plain on a target without the table and writes no table", async (_, restore) => {
    const { device, keyboard, writes } = holdSonsei({ help: ["keymap.custom\r\naltrepeat.map"] });

    const restored = await restore(device, [
      { command: "holdmods.map", data: TABLE },
      { command: "keymap.custom", data: KEYMAP },
      { command: "altrepeat.map", data: RULES },
    ]);

    expect(restored).toBe(true);
    expect(writes.filter(([cmd]) => cmd === "holdmods.map")).toEqual([]);
    expect(keyboard["keymap.custom"]).toBe(`41 ${PLAIN}`);
    expect(keyboard["altrepeat.map"]).toBe(`1 2 23 ${PLAIN} ${PLAIN}`);
    expect(Backup.takeRestoreWarnings()).toEqual([HOLD_MODS_NORMALIZED]);
  });

  test("restoreBackup counts help as unreadable for the whole restore when it fails at the start", async () => {
    // keepSupportedCommands and supportedCommands read help first, and every later read would list the table
    const { device, keyboard, writes } = holdSonsei({ help: [new Error("timeout"), new Error("timeout"), HELP] });

    const restored = await Backup.restoreBackup(
      [],
      "neuron",
      [
        { command: "keymap.custom", data: KEYMAP },
        { command: "holdmods.map", data: TABLE },
      ] as never,
      device,
    );

    expect(restored).toBe(true);
    expect(writes.filter(([cmd]) => cmd === "holdmods.map")).toEqual([]);
    expect(keyboard["holdmods.map"]).toBe(OLD_TABLE);
    expect(keyboard["keymap.custom"]).toBe(`41 ${PLAIN}`);
    expect(Backup.takeRestoreWarnings()).toEqual([HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED]);
  });

  test("restoreVirtual counts help as unreadable for the whole restore when it fails at the start", async () => {
    const { device, keyboard, writes } = holdSonsei({ help: [new Error("timeout"), HELP] });
    const virtual = {
      device: { info: { product: "Sonsei" } },
      virtual: {
        "keymap.custom": { data: KEYMAP, eraseable: true },
        "holdmods.map": { data: TABLE, eraseable: true },
      },
    };

    const restored = await Backup.restoreVirtual(virtual as never, device);

    expect(restored).toBe(true);
    expect(writes.filter(([cmd]) => cmd === "holdmods.map")).toEqual([]);
    expect(keyboard["holdmods.map"]).toBe(OLD_TABLE);
    expect(keyboard["keymap.custom"]).toBe(`41 ${PLAIN}`);
    expect(Backup.takeRestoreWarnings()).toEqual([HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED]);
  });
});
