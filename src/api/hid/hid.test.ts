import { describe, expect, test, vi } from "vitest";
import HID from "./hid";

// Keep the device definitions and their JSX keymaps out of the test
vi.mock("../hardware", () => ({ default: { serial: [] } }));
vi.mock("electron-log/renderer", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const REPORT_SIZE = 200;
const SONSEI_PRODUCT_ID = 49;

type ReportListener = (event: { data: DataView; device: { productId: number }; reportId: number }) => void;

const toReports = (reply: string) => {
  const bytes = new TextEncoder().encode(reply);
  const reports: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += REPORT_SIZE) {
    const report = new Uint8Array(REPORT_SIZE);
    report.set(bytes.slice(start, start + REPORT_SIZE));
    reports.push(report);
  }

  return reports;
};

const lensPacket = () => {
  const report = new Uint8Array(REPORT_SIZE);
  report.set([0xaa, 0x01, 0x02]);
  return report;
};

// Answer every sent command with the given reports, the way the firmware streams a reply over BLE
const runTestAsync = async (reports: Uint8Array[]) => {
  const listeners: ReportListener[] = [];
  const hid = new HID();
  hid.connectedDevice = {
    opened: true,
    addEventListener: (_type: string, listener: ReportListener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: ReportListener) => listeners.splice(listeners.indexOf(listener), 1),
    sendReport: async () => {
      reports.forEach(report => {
        [...listeners].forEach(listener =>
          listener({ data: new DataView(report.buffer), device: { productId: SONSEI_PRODUCT_ID }, reportId: 5 }),
        );
      });
    },
  } as unknown as HIDDevice;

  let received: string | undefined;
  const errors: Error[] = [];
  await hid.sendData(
    "superkeys.map\n",
    data => {
      received = data;
    },
    err => errors.push(err),
  );

  return { received, errors };
};

describe("HID.sendData", () => {
  test("EndMarkerSplitAcrossReports_FullReplyReturned", async () => {
    // Pad the body so "\r" ends the first report and "\n.\r\n" fills the second
    const body = `${"1 ".repeat(99)}`;
    const reports = toReports(`${body}9\r\n.\r\n`);

    const { received, errors } = await runTestAsync(reports);

    expect(reports).toHaveLength(2);
    expect(errors).toEqual([]);
    expect(received).toBe(`${body}9`);
  });

  test("LensPacketBetweenReports_PacketSkipped", async () => {
    const body = "1 ".repeat(150);
    const [first, second] = toReports(`${body}\r\n.\r\n`);

    const { received, errors } = await runTestAsync([first, lensPacket(), second]);

    expect(errors).toEqual([]);
    expect(received).toBe(body.trimEnd());
  });
});

// Answer each command after a delay, the way the keyboard replies over BLE, so overlapping requests are still waiting
const createKeyboard = (replies: Record<string, string>) => {
  const listeners: ReportListener[] = [];

  return {
    opened: true,
    addEventListener: (_type: string, listener: ReportListener) => listeners.push(listener),
    removeEventListener: (_type: string, listener: ReportListener) => listeners.splice(listeners.indexOf(listener), 1),
    sendReport: async (_reportId: number, data: Uint8Array) => {
      const command = new TextDecoder().decode(data).replace(/\0/g, "").trim();
      setTimeout(() => {
        toReports(`${replies[command]}\r\n.\r\n`).forEach(report => {
          [...listeners].forEach(listener =>
            listener({ data: new DataView(report.buffer), device: { productId: SONSEI_PRODUCT_ID }, reportId: 5 }),
          );
        });
      }, 10);
    },
  } as unknown as HIDDevice;
};

const createHID = (keyboard: HIDDevice) => {
  const hid = new HID();
  hid.connectedDevice = keyboard;
  return hid;
};

const requestAsync = (hid: HID, command: string, received: Record<string, string>, errors: Error[]) =>
  hid.sendData(
    `${command}\n`,
    data => {
      received[command] = data;
    },
    err => errors.push(err),
  );

describe("HID.sendData with overlapping requests", () => {
  test("OverlappingRequestsOnOneInstance_EachGetsOwnReply", async () => {
    const hid = createHID(
      createKeyboard({ "keyoverrides.map": "2 4 8 0 0 0 5 0 1 7 8 0 0 0 9 0 1", "wireless.battery.left.level": "87" }),
    );
    const received: Record<string, string> = {};
    const errors: Error[] = [];

    await Promise.all([
      requestAsync(hid, "keyoverrides.map", received, errors),
      requestAsync(hid, "wireless.battery.left.level", received, errors),
    ]);

    expect(errors).toEqual([]);
    expect(received).toEqual({ "keyoverrides.map": "2 4 8 0 0 0 5 0 1 7 8 0 0 0 9 0 1", "wireless.battery.left.level": "87" });
  });

  test("ScanRequestDuringPageRead_EachGetsOwnReply", async () => {
    // Open the same keyboard in a second instance, as a scan does while a Device is connected
    const keyboard = createKeyboard({ "qukeys.dualFunction": "0 1 0 0 0 0 0", "hardware.chip_id": "cdb6de468e6fb2d8" });
    const connected = createHID(keyboard);
    const scan = createHID(keyboard);
    const received: Record<string, string> = {};
    const errors: Error[] = [];

    await Promise.all([
      requestAsync(connected, "qukeys.dualFunction", received, errors),
      requestAsync(scan, "hardware.chip_id", received, errors),
    ]);

    expect(errors).toEqual([]);
    expect(received).toEqual({ "qukeys.dualFunction": "0 1 0 0 0 0 0", "hardware.chip_id": "cdb6de468e6fb2d8" });
  });
});
