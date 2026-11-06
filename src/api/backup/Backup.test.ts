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
});
