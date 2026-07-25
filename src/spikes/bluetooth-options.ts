export type BluetoothCommand =
  | "list"
  | "input"
  | "feedback"
  | "led-diagnostic"
  | "help";

export interface BluetoothOptions {
  command: BluetoothCommand;
  confirmOutput: boolean;
  devicePath?: string;
  durationSeconds: number;
}

export class BluetoothOptionsError extends Error {
  override readonly name = "BluetoothOptionsError";
}

export function parseBluetoothOptions(args: readonly string[]): BluetoothOptions {
  const command = parseCommand(args[0]);
  let confirmOutput = false;
  let devicePath: string | undefined;
  let durationSeconds = 30;

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--confirm-output":
        confirmOutput = true;
        break;
      case "--device": {
        const value = args[index + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new BluetoothOptionsError("--device requires a HID path.");
        }
        devicePath = value;
        index += 1;
        break;
      }
      case "--duration-seconds": {
        const value = args[index + 1];
        const parsed = Number(value);
        if (
          value === undefined
          || !Number.isFinite(parsed)
          || parsed <= 0
          || parsed > 3_600
        ) {
          throw new BluetoothOptionsError(
            "--duration-seconds must be a number from 0 to 3600.",
          );
        }
        durationSeconds = parsed;
        index += 1;
        break;
      }
      default:
        throw new BluetoothOptionsError(`Unknown argument: ${argument}`);
    }
  }

  return {
    command,
    confirmOutput,
    durationSeconds,
    ...(devicePath === undefined ? {} : { devicePath }),
  };
}

function parseCommand(value: string | undefined): BluetoothCommand {
  switch (value) {
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return "help";
    case "list":
    case "input":
    case "feedback":
    case "led-diagnostic":
      return value;
    default:
      throw new BluetoothOptionsError(`Unknown command: ${value}`);
  }
}
