import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, test } from "vitest";
import { findLatestBackup, parseBackupToModel } from "./backup-reader";

const createBackup = (backup: { command: string; data: string }[]) => JSON.stringify({ neuronID: "test", backup });

describe("Lens backup reader", () => {
  test("reads the macro actions from macros.map", () => {
    const model = parseBackupToModel(createBackup([{ command: "macros.map", data: "8 4 0 0" }]), "Sonsei");

    expect(model.macros).toEqual([[{ type: 8, keyCode: 4 }]]);
  });

  test("gives no macros without macros.map", () => {
    const model = parseBackupToModel(createBackup([]), "Sonsei");

    expect(model.macros).toEqual([]);
  });

  test("reads the Superkey actions from superkeys.map", () => {
    const model = parseBackupToModel(createBackup([{ command: "superkeys.map", data: "4 5 6 7 8 0 9 1 1 1 1 0 0" }]), "Sonsei");

    expect(model.superkeys).toEqual([
      [4, 5, 6, 7, 8],
      [9, 1, 1, 1, 1],
    ]);
  });
});

describe("findLatestBackup", () => {
  test("RecoveryBackupNewerByMtime_Ignored", () => {
    const backupFolder = fs.mkdtempSync(path.join(os.tmpdir(), "lens-backups-"));
    const folder = path.join(backupFolder, "Sonsei", "n1");
    const regular = path.join(folder, "20261110090000-Sonsei.json");
    const recovery = path.join(folder, "20261110090507042-Sonsei-before-cleanup.json");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(regular, "{}");
    fs.writeFileSync(recovery, "{}");
    fs.utimesSync(regular, new Date(2026, 0, 1), new Date(2026, 0, 1));
    fs.utimesSync(recovery, new Date(2026, 0, 2), new Date(2026, 0, 2));

    try {
      expect(findLatestBackup({ backupFolder, neuronID: "n1", product: "Sonsei" })).toBe(regular);
    } finally {
      fs.rmSync(backupFolder, { recursive: true, force: true });
    }
  });
});
