import { describe, expect, test } from "vitest";
import { parseBackupToModel } from "./backup-reader";

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
