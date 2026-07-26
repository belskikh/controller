import { describe, expect, it } from "vitest";
import { computeBluetoothReportChecksum } from "dualsense-ts";
import { buildBluetoothLedReport } from "./output-report.js";

describe("buildBluetoothLedReport", () => {
  it("builds the dualsense-ts layout", () => {
    const report = buildBluetoothLedReport({
      layout: "dualsense-ts",
      sequence: 0,
      color: { r: 255, g: 0, b: 0 },
    });

    expect(report).toHaveLength(78);
    expect(report[0]).toBe(0x31);
    expect(report[1]).toBe(0x02);
    expect(report[3]).toBe(0x04);
    expect(report[46]).toBe(255);
    expect(readCRC(report)).toBe(computeBluetoothReportChecksum(report));
  });

  it("builds the Sony/Linux layout with sequence and tag", () => {
    const report = buildBluetoothLedReport({
      layout: "sony",
      sequence: 7,
      color: { r: 0, g: 255, b: 0 },
    });

    expect(report[0]).toBe(0x31);
    expect(report[1]).toBe(0x70);
    expect(report[2]).toBe(0x10);
    expect(report[4]).toBe(0x04);
    expect(report[48]).toBe(255);
    expect(readCRC(report)).toBe(computeBluetoothReportChecksum(report));
  });

  it("puts animation release in a separate valid-flag field", () => {
    const report = buildBluetoothLedReport({
      layout: "sony",
      sequence: 1,
      releaseAnimation: true,
    });

    expect(report[41]).toBe(0x02);
    expect(report[44]).toBe(0x02);
    expect(report[4]).toBe(0);
  });

  it("encodes compatible rumble in the Sony common payload", () => {
    const report = buildBluetoothLedReport({
      layout: "sony",
      sequence: 2,
      rumble: { left: 0.5, right: 0.25 },
    });

    expect(report[3]).toBe(0x03);
    expect(report[5]).toBe(64);
    expect(report[6]).toBe(128);
  });

  it("does not engage compatible rumble for visual-only updates", () => {
    const report = buildBluetoothLedReport({
      layout: "sony",
      sequence: 3,
      color: { r: 0, g: 0, b: 0 },
      playerLeds: 0,
    });

    expect(report[3]).toBe(0);
    expect(report[5]).toBe(0);
    expect(report[6]).toBe(0);
  });
});

function readCRC(report: Uint8Array): number {
  return (
    report[74]!
    | (report[75]! << 8)
    | (report[76]! << 16)
    | (report[77]! << 24)
  ) >>> 0;
}
