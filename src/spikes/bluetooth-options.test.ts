import { describe, expect, it } from "vitest";
import {
  BluetoothOptionsError,
  parseBluetoothOptions,
} from "./bluetooth-options.js";

describe("parseBluetoothOptions", () => {
  it("uses safe input defaults", () => {
    expect(parseBluetoothOptions(["input"])).toEqual({
      command: "input",
      confirmOutput: false,
      durationSeconds: 30,
    });
  });

  it("parses feedback confirmation and device path", () => {
    expect(
      parseBluetoothOptions([
        "feedback",
        "--confirm-output",
        "--device",
        "bt-path",
      ]),
    ).toEqual({
      command: "feedback",
      confirmOutput: true,
      devicePath: "bt-path",
      durationSeconds: 30,
    });
  });

  it("rejects invalid durations", () => {
    expect(() =>
      parseBluetoothOptions(["input", "--duration-seconds", "0"]),
    ).toThrow(BluetoothOptionsError);
  });

  it("rejects unknown arguments", () => {
    expect(() => parseBluetoothOptions(["list", "--surprise"])).toThrow(
      /Unknown argument/,
    );
  });

  it("accepts the LED diagnostic command", () => {
    expect(
      parseBluetoothOptions(["led-diagnostic", "--confirm-output"]),
    ).toMatchObject({
      command: "led-diagnostic",
      confirmOutput: true,
    });
  });
});
