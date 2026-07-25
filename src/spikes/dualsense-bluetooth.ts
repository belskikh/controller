#!/usr/bin/env node

import {
  ChargeStatus,
  type DualsenseHID,
  type DualsenseHIDState,
  type DualsenseDeviceInfo,
  InputId,
  NodeHIDProvider,
} from "dualsense-ts";
import {
  BluetoothDeviceError,
  connectBluetoothHID,
  delay,
  disconnectHID,
} from "../dualsense/bluetooth.js";
import {
  BluetoothOptionsError,
  parseBluetoothOptions,
  type BluetoothOptions,
} from "./bluetooth-options.js";
import {
  buildBluetoothLedReport,
  type BluetoothOutputLayout,
  type RGB,
} from "../dualsense/output-report.js";
import { BluetoothDualSenseOutput } from "../dualsense/output.js";

const HELP = `Bluetooth-only DualSense diagnostic

Usage:
  npm run spike:bt -- list
  npm run spike:bt -- input [--duration-seconds 30] [--device PATH]
  npm run spike:bt -- feedback --confirm-output [--device PATH]
  npm run spike:bt -- led-diagnostic --confirm-output [--device PATH]

Commands:
  list      Enumerate DualSense HID devices; never sends output.
  input     Print button and trigger events; never sends output.
  feedback  Briefly test lightbar, player LEDs, and low rumble.
  led-diagnostic
            Show red with the library layout, then green with Sony's layout.

Safety:
  feedback is rejected unless --confirm-output is present.
  USB devices are always rejected by input and feedback.
`;

async function main(): Promise<void> {
  const options = parseBluetoothOptions(process.argv.slice(2));

  switch (options.command) {
    case "help":
      process.stdout.write(HELP);
      return;
    case "list":
      await listDevices();
      return;
    case "input":
      await readInput(options);
      return;
    case "feedback":
      await testFeedback(options);
      return;
    case "led-diagnostic":
      await testLedLayouts(options);
      return;
  }
}

async function listDevices(): Promise<void> {
  const devices = await NodeHIDProvider.enumerate();
  const summary = {
    count: devices.length,
    bluetoothCount: devices.filter((device) => device.wireless).length,
    devices: devices.map(publicDeviceInfo),
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function publicDeviceInfo(device: DualsenseDeviceInfo): object {
  return {
    path: device.path,
    serialNumber: device.serialNumber ?? null,
    transport: device.wireless ? "bluetooth" : "usb",
  };
}

async function readInput(options: BluetoothOptions): Promise<void> {
  const connection = await connectBluetoothHID(options.devicePath);
  let previous = { ...connection.hid.state };
  const handleState = (state: DualsenseHIDState): void => {
    emitStateChanges(previous, state);
    previous = { ...state };
  };

  try {
    emit("connected", {
      ...publicDeviceInfo(connection.device),
      wireless: connection.hid.wireless,
      mode: "read-only",
    });

    connection.hid.register(handleState);

    const stopReason = await waitForStop(
      options.durationSeconds * 1_000,
      connection.hid,
    );
    emit("stopped", { reason: stopReason });
  } finally {
    connection.hid.unregister(handleState);
    disconnectHID(connection);
  }
}

type ButtonInputId =
  | InputId.Cross
  | InputId.Circle
  | InputId.Square
  | InputId.Triangle
  | InputId.Playstation
  | InputId.Mute
  | InputId.Options
  | InputId.Create
  | InputId.Up
  | InputId.Down
  | InputId.Left
  | InputId.Right
  | InputId.LeftBumper
  | InputId.RightBumper
  | InputId.LeftTriggerButton
  | InputId.RightTriggerButton
  | InputId.LeftAnalogButton
  | InputId.RightAnalogButton
  | InputId.TouchButton;

const buttonInputs: ReadonlyArray<
  readonly [string, ButtonInputId]
> = [
  ["cross", InputId.Cross],
  ["circle", InputId.Circle],
  ["square", InputId.Square],
  ["triangle", InputId.Triangle],
  ["ps", InputId.Playstation],
  ["mute", InputId.Mute],
  ["options", InputId.Options],
  ["create", InputId.Create],
  ["dpad.up", InputId.Up],
  ["dpad.down", InputId.Down],
  ["dpad.left", InputId.Left],
  ["dpad.right", InputId.Right],
  ["left.bumper", InputId.LeftBumper],
  ["right.bumper", InputId.RightBumper],
  ["left.trigger.button", InputId.LeftTriggerButton],
  ["right.trigger.button", InputId.RightTriggerButton],
  ["left.stick.button", InputId.LeftAnalogButton],
  ["right.stick.button", InputId.RightAnalogButton],
  ["touchpad.button", InputId.TouchButton],
];

function emitStateChanges(
  previous: DualsenseHIDState,
  state: DualsenseHIDState,
): void {
  for (const [name, inputId] of buttonInputs) {
    if (state[inputId] !== previous[inputId]) {
      emit("button", { name, pressed: state[inputId] });
    }
  }

  for (
    const [name, inputId] of [
      ["left.trigger", InputId.LeftTrigger],
      ["right.trigger", InputId.RightTrigger],
    ] as const
  ) {
    if (Math.abs(state[inputId] - previous[inputId]) >= 0.05) {
      emit("trigger", {
        name,
        pressure: Number(state[inputId].toFixed(3)),
      });
    }
  }

  if (
    state[InputId.BatteryLevel] !== previous[InputId.BatteryLevel]
    || state[InputId.BatteryStatus] !== previous[InputId.BatteryStatus]
  ) {
    emit("battery", {
      level: Number(state[InputId.BatteryLevel].toFixed(2)),
      status: ChargeStatus[state[InputId.BatteryStatus]],
    });
  }
}

async function testFeedback(options: BluetoothOptions): Promise<void> {
  if (!options.confirmOutput) {
    throw new BluetoothOptionsError(
      "feedback changes controller outputs; rerun with --confirm-output.",
    );
  }

  const connection = await connectBluetoothHID(options.devicePath);
  const output = new BluetoothDualSenseOutput(connection.provider);
  try {
    emit("connected", {
      ...publicDeviceInfo(connection.device),
      wireless: connection.hid.wireless,
    });

    await feedbackSequence(output);
    emit("feedback-complete", { outputsReset: true });
  } finally {
    await output.reset().catch(() => {});
    disconnectHID(connection);
  }
}

async function feedbackSequence(
  output: BluetoothDualSenseOutput,
): Promise<void> {
  await output.releaseFirmwareAnimation();
  await output.setColor({ r: 0, g: 40, b: 160 });
  await output.setPlayerLeds(0b0_0100);
  await delay(450);

  await output.setColor({ r: 0, g: 180, b: 35 });
  await output.setPlayerLeds(0b1_0101);
  await delay(450);

  await output.setRumble(0.18);
  await delay(280);
  await output.setRumble(0);
  await delay(150);
}

async function testLedLayouts(options: BluetoothOptions): Promise<void> {
  if (!options.confirmOutput) {
    throw new BluetoothOptionsError(
      "led-diagnostic changes controller LEDs; rerun with --confirm-output.",
    );
  }
  const connection = await connectBluetoothHID(options.devicePath);
  let sequence = 0;
  const send = async (
    layout: BluetoothOutputLayout,
    reportOptions: { color?: RGB; releaseAnimation?: boolean },
  ): Promise<void> => {
    await connection.provider.write(
      buildBluetoothLedReport({
        layout,
        sequence,
        ...reportOptions,
      }),
    );
    sequence = (sequence + 1) & 0x0f;
  };

  try {
    emit("led-stage", {
      color: "red",
      layout: "dualsense-ts",
      durationMs: 2_000,
    });
    await send("dualsense-ts", { releaseAnimation: true });
    await delay(350);
    await send("dualsense-ts", { color: { r: 255, g: 0, b: 0 } });
    await delay(2_000);
    await send("dualsense-ts", { color: { r: 0, g: 0, b: 0 } });
    await delay(250);

    emit("led-stage", {
      color: "green",
      layout: "sony",
      durationMs: 2_000,
    });
    await send("sony", { releaseAnimation: true });
    await delay(350);
    await send("sony", { color: { r: 0, g: 255, b: 0 } });
    await delay(2_000);
    await send("sony", { color: { r: 0, g: 0, b: 0 } });
    await delay(250);
    emit("led-diagnostic-complete", { outputsReset: true });
  } finally {
    await send("dualsense-ts", { color: { r: 0, g: 0, b: 0 } }).catch(
      () => {},
    );
    await send("sony", { color: { r: 0, g: 0, b: 0 } }).catch(() => {});
    await delay(120);
    disconnectHID(connection);
  }
}

function waitForStop(
  durationMs: number,
  hid: DualsenseHID,
): Promise<"timeout" | "signal" | "disconnected"> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = (): void => {};
    const finish = (reason: "timeout" | "signal" | "disconnected"): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      unsubscribe();
      resolve(reason);
    };
    const onSignal = (): void => finish("signal");
    const onDisconnect = (): void => finish("disconnected");
    const timer = setTimeout(() => finish("timeout"), durationMs);

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    unsubscribe = hid.onConnectionChange((connected) => {
      if (!connected) {
        onDisconnect();
      }
    });
  });
}

function emit(type: string, details: object): void {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), type, ...details })}\n`,
  );
}

main().catch((error: unknown) => {
  if (
    error instanceof BluetoothDeviceError
    || error instanceof BluetoothOptionsError
  ) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
