import {
  DualsenseHID,
  type DualsenseDeviceInfo,
  NodeHIDProvider,
} from "dualsense-ts";

export const DEFAULT_CONNECTION_TIMEOUT_MS = 8_000;

export class BluetoothDeviceError extends Error {
  override readonly name = "BluetoothDeviceError";
}

export function selectBluetoothDevice(
  devices: readonly DualsenseDeviceInfo[],
  requestedPath?: string,
): DualsenseDeviceInfo {
  const requested = requestedPath === undefined
    ? undefined
    : devices.find((device) => device.path === requestedPath);

  if (requestedPath !== undefined && requested === undefined) {
    throw new BluetoothDeviceError(
      `DualSense device not found at path: ${requestedPath}`,
    );
  }

  if (requested !== undefined && !requested.wireless) {
    throw new BluetoothDeviceError(
      "The selected DualSense is connected over USB. This project is Bluetooth-only.",
    );
  }

  const wireless = requested ?? devices.find((device) => device.wireless);
  if (wireless !== undefined) {
    return wireless;
  }

  if (devices.length > 0) {
    throw new BluetoothDeviceError(
      "DualSense was found, but only over USB. Pair and connect it in macOS Bluetooth settings.",
    );
  }

  throw new BluetoothDeviceError(
    "No DualSense was found. Pair it in macOS Bluetooth settings, then press the PS button.",
  );
}

export interface BluetoothHIDConnection {
  device: DualsenseDeviceInfo;
  hid: DualsenseHID;
  provider: NodeHIDProvider;
}

export async function connectBluetoothHID(
  requestedPath?: string,
  timeoutMs = DEFAULT_CONNECTION_TIMEOUT_MS,
): Promise<BluetoothHIDConnection> {
  const devices = await NodeHIDProvider.enumerate();
  const device = selectBluetoothDevice(devices, requestedPath);
  const provider = new NodeHIDProvider({ devicePath: device.path });
  const hid = new DualsenseHID(provider);

  try {
    await waitForConnection(hid, provider, timeoutMs);
    if (!hid.wireless) {
      throw new BluetoothDeviceError(
        "The opened controller did not report a Bluetooth transport.",
      );
    }
    return { device, hid, provider };
  } catch (error) {
    hid.dispose();
    provider.disconnect();
    throw error;
  }
}

async function waitForConnection(
  hid: DualsenseHID,
  provider: NodeHIDProvider,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    const unsubscribe = hid.onConnectionChange((connected) => {
      if (connected) {
        finish();
      }
    });
    const timer = setTimeout(() => {
      finish(
        new BluetoothDeviceError(
          `Timed out after ${timeoutMs} ms while opening the Bluetooth DualSense.`,
        ),
      );
    }, timeoutMs);

    hid.on("error", (error) => {
      finish(new BluetoothDeviceError(`DualSense HID error: ${error.message}`));
    });

    void Promise.resolve(provider.connect()).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      finish(new BluetoothDeviceError(`Could not open DualSense: ${message}`));
    });
  });
}

export function disconnectHID(connection: BluetoothHIDConnection): void {
  connection.hid.dispose();
  connection.provider.disconnect();
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
