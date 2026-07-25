import { computeBluetoothReportChecksum } from "dualsense-ts";

export type BluetoothOutputLayout = "dualsense-ts" | "sony";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LedReportOptions {
  color?: RGB;
  layout: BluetoothOutputLayout;
  playerLeds?: number;
  releaseAnimation?: boolean;
  rumble?: {
    left: number;
    right: number;
  };
  sequence: number;
}

const REPORT_SIZE = 78;
const CRC_OFFSET = 74;

export function buildBluetoothLedReport(
  options: LedReportOptions,
): Uint8Array {
  const report = new Uint8Array(REPORT_SIZE);
  report[0] = 0x31;

  const commonOffset = options.layout === "sony" ? 3 : 2;
  if (options.layout === "sony") {
    report[1] = (options.sequence & 0x0f) << 4;
    report[2] = 0x10;
  } else {
    report[1] = 0x02;
  }

  if (options.rumble !== undefined) {
    report[commonOffset] = 0x03;
    report[commonOffset + 2] = intensityByte(options.rumble.right);
    report[commonOffset + 3] = intensityByte(options.rumble.left);
  }
  if (options.releaseAnimation === true) {
    report[commonOffset + 38] =
      (report[commonOffset + 38] ?? 0) | 0x02;
    report[commonOffset + 41] = 0x02;
  }
  if (options.color !== undefined) {
    report[commonOffset + 1] =
      (report[commonOffset + 1] ?? 0) | 0x04;
    report[commonOffset + 44] = byte(options.color.r);
    report[commonOffset + 45] = byte(options.color.g);
    report[commonOffset + 46] = byte(options.color.b);
  }
  if (options.playerLeds !== undefined) {
    report[commonOffset + 1] =
      (report[commonOffset + 1] ?? 0) | 0x10;
    report[commonOffset + 43] = options.playerLeds & 0x1f;
  }

  const crc = computeBluetoothReportChecksum(report);
  report[CRC_OFFSET] = crc & 0xff;
  report[CRC_OFFSET + 1] = (crc >>> 8) & 0xff;
  report[CRC_OFFSET + 2] = (crc >>> 16) & 0xff;
  report[CRC_OFFSET + 3] = (crc >>> 24) & 0xff;
  return report;
}

function byte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function intensityByte(value: number): number {
  return byte(Math.min(1, Math.max(0, value)) * 255);
}
