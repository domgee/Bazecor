import { describe, expect, test, vi } from "vitest";
import backupAfterSave from "./backupAfterSave";

describe("backupAfterSave", () => {
  test("a failed backup of a real keyboard is only reported", async () => {
    const onIgnored = vi.fn();
    const failure = new Error("disk full");

    await backupAfterSave(
      false,
      async () => {
        throw failure;
      },
      onIgnored,
    );

    expect(onIgnored).toHaveBeenCalledWith(failure);
  });

  test("a failed backup of a virtual keyboard fails the save", async () => {
    const onIgnored = vi.fn();

    await expect(
      backupAfterSave(
        true,
        async () => {
          throw new Error("read-only file");
        },
        onIgnored,
      ),
    ).rejects.toThrow("read-only file");
    expect(onIgnored).not.toHaveBeenCalled();
  });

  test.each([[false], [true]])("a backup that works is run once, virtual %s", async isVirtual => {
    const runBackup = vi.fn(async () => {});
    const onIgnored = vi.fn();

    await backupAfterSave(isVirtual, runBackup, onIgnored);

    expect(runBackup).toHaveBeenCalledTimes(1);
    expect(onIgnored).not.toHaveBeenCalled();
  });
});
