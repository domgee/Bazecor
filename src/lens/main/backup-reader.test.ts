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

  test("reads the custom LED effects from led.custom", () => {
    const model = parseBackupToModel(createBackup([{ command: "led.custom", data: "2 0 0 0 0 0 1 255 0 0 0" }]), "Sonsei");

    expect(model.ledCustom?.slice(0, 3)).toEqual([
      { type: 0, r: 0, g: 0, b: 0, speed: 0 },
      { type: 1, r: 255, g: 0, b: 0, speed: 0 },
      { type: 0, r: 0, g: 0, b: 0, speed: 0 },
    ]);
  });

  test("gives no custom LED effects without led.custom", () => {
    const model = parseBackupToModel(createBackup([]), "Sonsei");

    expect(model.ledCustom).toEqual([]);
  });

  test("reads the Superkey actions from superkeys.map", () => {
    const model = parseBackupToModel(createBackup([{ command: "superkeys.map", data: "4 5 6 7 8 0 9 1 1 1 1 0 0" }]), "Sonsei");

    expect(model.superkeys).toEqual([
      [4, 5, 6, 7, 8],
      [9, 1, 1, 1, 1],
    ]);
  });
});
