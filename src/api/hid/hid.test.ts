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
