import { resolve } from "node:path";

export interface DaemonOptions {
  configPath: string;
  enableActions: boolean;
  enableVoice: boolean;
  macOSHelperPath: string;
}

export class DaemonOptionsError extends Error {
  override readonly name = "DaemonOptionsError";
}

export function parseDaemonOptions(
  args: readonly string[],
  cwd = process.cwd(),
): DaemonOptions {
  let configPath = resolve(cwd, "config.json");
  let macOSHelperPath = resolve(
    cwd,
    "helpers/macos-control/bin/macos-control",
  );
  let enableActions = false;
  let enableVoice = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--config": {
        const value = requiredValue(args, index, "--config");
        configPath = resolve(cwd, value);
        index += 1;
        break;
      }
      case "--macos-helper": {
        const value = requiredValue(args, index, "--macos-helper");
        macOSHelperPath = resolve(cwd, value);
        index += 1;
        break;
      }
      case "--enable-actions":
        enableActions = true;
        break;
      case "--enable-voice":
        enableVoice = true;
        break;
      default:
        throw new DaemonOptionsError(`Unknown daemon argument: ${argument}`);
    }
  }

  return {
    configPath,
    enableActions,
    enableVoice,
    macOSHelperPath,
  };
}

function requiredValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new DaemonOptionsError(`${option} requires a value.`);
  }
  return value;
}
