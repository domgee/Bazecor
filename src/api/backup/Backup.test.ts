import fs from "fs";
import os from "os";
import path from "path";
import { ipcRenderer } from "electron";
import { afterEach, describe, expect, test, vi } from "vitest";
import Backup, { backupFileName, fitCommandToDevice } from "./Backup";
import Device from "../comms/Device";
import { BackupType } from "@Renderer/types/backups";
import { MACROS_NOT_RESTORED } from "../parsers/macros";
import { HOLD_MODS_NORMALIZED, HOLD_MODS_NOT_RESTORED } from "../parsers/holdMods";

vi.mock("electron", () => ({ ipcRenderer: { invoke: vi.fn(), send: vi.fn(), on: vi.fn() } }));

vi.mock("electron-log/renderer", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), verbose: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({ backupFolder: undefined as string | undefined }));

vi.mock("../../renderer/utils/Store", () => ({
  default: {
    getStore: () => ({
      get: vi.fn((key: string) => (key === "settings.backupFolder" ? settings.backupFolder : undefined)),
      set: vi.fn(),
    }),
  },
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

describe("Backup.SaveFirstBackup", () => {
  const NEURON_ID = "cdb6de468e6fb2d8";

  const createKeyboard = () =>
    ({
      file: false,
      device: { info: { product: "Sonsei", keyboardType: "wireless" } },
      command: vi.fn(async (cmd: string) => ({ help: "keymap.custom", "keymap.custom": "41 30", version: "v1.2.15" })[cmd] ?? ""),
    }) as unknown as Device;

  const useBackupFolder = () => {
    settings.backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "bazecor-backups-"));
    return path.join(settings.backupFolder, "Sonsei", NEURON_ID);
  };

  afterEach(() => {
    fs.rmSync(settings.backupFolder, { recursive: true, force: true });
    settings.backupFolder = undefined;
    vi.mocked(ipcRenderer.send).mockClear();
  });

  test("KeyboardWithoutBackup_BackupSavedAndLensNotified", async () => {
    const keyboardFolder = useBackupFolder();

    const saved = await Backup.SaveFirstBackup(NEURON_ID, createKeyboard());

    const files = fs.readdirSync(keyboardFolder);
    const backup = JSON.parse(fs.readFileSync(path.join(keyboardFolder, files[0]), "utf-8"));
    expect(saved).toBe(true);
    expect(files).toHaveLength(1);
    // Expect led.brightnessUG too, since Commands always backs it up
    expect(backup.backup).toEqual([
      { command: "keymap.custom", data: "41 30" },
      { command: "led.brightnessUG", data: "" },
    ]);
    expect(ipcRenderer.send).toHaveBeenCalledWith("lens:backup-saved", {
      backupFolder: settings.backupFolder,
      neuronID: NEURON_ID,
      product: "Sonsei",
      keyboardType: "wireless",
    });
  });

  test("KeyboardWithBackup_NothingSaved", async () => {
    const keyboardFolder = useBackupFolder();
    fs.mkdirSync(keyboardFolder, { recursive: true });
    fs.writeFileSync(path.join(keyboardFolder, "20261105120000-NoName.json"), "{}");
    const keyboard = createKeyboard();

    const saved = await Backup.SaveFirstBackup(NEURON_ID, keyboard);

    expect(saved).toBe(false);
    expect(fs.readdirSync(keyboardFolder)).toEqual(["20261105120000-NoName.json"]);
    expect(keyboard.command).not.toHaveBeenCalled();
  });
});

describe("backupFileName", () => {
  // Month 10 is November, since Date months start at 0
  const date = new Date(2026, 10, 10, 9, 5, 7, 42);

  test("RegularAndRecoveryInSameSecond_NamesDiffer", () => {
    const regular = backupFileName(date, "My Sonsei!");
    const recovery = backupFileName(date, "My Sonsei!", "-before-cleanup", true);

    expect(regular).toBe("20261110090507-My Sonsei.json");
    expect(recovery).toBe("20261110090507042-My Sonsei-before-cleanup.json");
  });

  test("NoName_FallbackName", () => {
    expect(backupFileName(date, "")).toBe("20261110090507-NoName.json");
  });
});

describe("Backup.SaveRecoveryBackup and getLatestBackup", () => {
  const NEURON_ID = "cdb6de468e6fb2d8";
  const SUPERKEYS = "4 224 5 1 1 0 65535";
  const keyboard = { file: false, device: { info: { product: "Sonsei", keyboardType: "wireless" } } } as unknown as Device;
  const backup: BackupType = {
    neuronID: NEURON_ID,
    neuron: { id: NEURON_ID, name: "Sonsei", device: undefined, layers: [], macros: [], superkeys: [] },
    versions: { bazecor: "v1", kaleidoscope: "k", firmware: "f" },
    backup: [{ command: "superkeys.map", data: SUPERKEYS }],
  };
  // Freeze the clock, so both saves land in the same millisecond
  const now = () => new Date(2026, 10, 10, 9, 5, 7, 42);

  const useBackupFolder = () => {
    settings.backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "bazecor-backups-"));
    return path.join(settings.backupFolder, "Sonsei", NEURON_ID);
  };

  afterEach(() => {
    fs.rmSync(settings.backupFolder, { recursive: true, force: true });
    settings.backupFolder = undefined;
    vi.mocked(ipcRenderer.send).mockClear();
  });

  test("TwoSavesInSameMillisecond_SecondGetsCounterAndLensNotNotified", async () => {
    const keyboardFolder = useBackupFolder();

    const first = await Backup.SaveRecoveryBackup(backup, keyboard, now);
    const second = await Backup.SaveRecoveryBackup({ ...backup, backup: [{ command: "superkeys.map", data: "5 1 1 1 1 0" }] }, keyboard, now);

    expect([first, second]).toEqual([
      path.join(keyboardFolder, "20261110090507042-Sonsei-before-cleanup.json"),
      path.join(keyboardFolder, "20261110090507042-Sonsei-before-cleanup-2.json"),
    ]);
    expect(JSON.parse(fs.readFileSync(first, "utf-8")).backup).toEqual([{ command: "superkeys.map", data: SUPERKEYS }]);
    expect(ipcRenderer.send).not.toHaveBeenCalled();
  });

  test("BackupWithoutSuperkeys_RefusedBeforeWriting", async () => {
    const keyboardFolder = useBackupFolder();

    const save = Backup.SaveRecoveryBackup({ ...backup, backup: [{ command: "superkeys.map", data: "" }] }, keyboard, now);

    await expect(save).rejects.toThrow("does not hold the Superkeys");
    expect(fs.existsSync(keyboardFolder) ? fs.readdirSync(keyboardFolder) : []).toEqual([]);
  });

  test("ReadBackDiffers_FileRemovedAndRefused", async () => {
    const keyboardFolder = useBackupFolder();
    // Return another file's content, as if the write did not land in full
    const readFile = vi.spyOn(fs.promises, "readFile").mockResolvedValueOnce("{}");

    const save = Backup.SaveRecoveryBackup(backup, keyboard, now);

    await expect(save).rejects.toThrow("does not hold the Superkeys");
    expect(fs.readdirSync(keyboardFolder)).toEqual([]);
    readFile.mockRestore();
  });

  test("VirtualKeyboard_Refused", async () => {
    useBackupFolder();

    const save = Backup.SaveRecoveryBackup(backup, { ...keyboard, file: true } as unknown as Device, now);

    await expect(save).rejects.toThrow("virtual");
  });

  test("RecoveryNewerThanRegular_LatestIsRegular", async () => {
    const keyboardFolder = useBackupFolder();
    fs.mkdirSync(keyboardFolder, { recursive: true });
    fs.writeFileSync(path.join(keyboardFolder, "20261110090000-Sonsei.json"), JSON.stringify({ regular: true }));
    // Make the recovery file the newest by its timestamps
    await new Promise(resolve => {
      setTimeout(resolve, 20);
    });
    await Backup.SaveRecoveryBackup(backup, keyboard, now);

    const latest = await Backup.getLatestBackup(settings.backupFolder, NEURON_ID, keyboard);

    expect(latest).toEqual({ regular: true });
  });

  test("OnlyRecoveryBackup_FirstBackupStillSaved", async () => {
    const keyboardFolder = useBackupFolder();
    await Backup.SaveRecoveryBackup(backup, keyboard, now);
    const device = {
      ...keyboard,
      command: vi.fn(async (cmd: string) => ({ help: "superkeys.map", "superkeys.map": SUPERKEYS, version: "v1 k f" })[cmd] ?? ""),
    } as unknown as Device;

    const saved = await Backup.SaveFirstBackup(NEURON_ID, device);
    // Let the callback of SaveBackup's own mkdir run before the folder is removed
    await new Promise(resolve => {
      setTimeout(resolve, 20);
    });

    expect(saved).toBe(true);
    expect(fs.readdirSync(keyboardFolder)).toHaveLength(2);
  });
});

describe("fitCommandToDevice", () => {
  const SEPARATED = "4 224 1 1 1 0 5 1 1 1 1 0 0";

  test("writes a Superkey table as all 129 padded rows for a Sonsei", () => {
    const fitted = fitCommandToDevice("superkeys.map", SEPARATED, "Sonsei");

    expect(fitted.split(" ")).toHaveLength(129 * 6);
    expect(fitted.startsWith("4 224 1 1 1 0 5 1 1 1 1 0 65535")).toBe(true);
  });

  test("writes a padded Superkey table in the old shape for other keyboards", () => {
    const padded = fitCommandToDevice("superkeys.map", SEPARATED, "Sonsei");

    expect(fitCommandToDevice("superkeys.map", padded, "Defy")).toBe(SEPARATED);
    expect(fitCommandToDevice("superkeys.map", padded, "Raise2")).toBe(SEPARATED);
  });

  test("leaves unparsable Superkey data, other commands and an unknown target unchanged", () => {
    expect(fitCommandToDevice("superkeys.map", "4 x 0", "Sonsei")).toBe("4 x 0");
    expect(fitCommandToDevice("keymap.custom", SEPARATED, "Sonsei")).toBe(SEPARATED);
    expect(fitCommandToDevice("superkeys.map", SEPARATED, undefined)).toBe(SEPARATED);
  });
});
