import { describe, expect, it } from "vitest";
import {
  BluetoothDeviceError,
  selectBluetoothDevice,
} from "./bluetooth.js";

describe("selectBluetoothDevice", () => {
  const usb = { path: "usb", serialNumber: "one", wireless: false };
  const bluetooth = { path: "bt", serialNumber: "one", wireless: true };

  it("prefers a Bluetooth device", () => {
    expect(selectBluetoothDevice([usb, bluetooth])).toBe(bluetooth);
  });

  it("allows selecting a specific Bluetooth path", () => {
    expect(selectBluetoothDevice([bluetooth], "bt")).toBe(bluetooth);
  });

  it("rejects a selected USB path", () => {
    expect(() => selectBluetoothDevice([usb], "usb")).toThrow(
      BluetoothDeviceError,
    );
  });

  it("rejects a missing controller", () => {
    expect(() => selectBluetoothDevice([])).toThrow(/No DualSense/);
  });
});
