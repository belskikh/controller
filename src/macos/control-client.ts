import { execFile } from "node:child_process";

export interface FrontmostApplication {
  bundleIdentifier: string | null;
  name: string | null;
  pid: number | null;
}

export interface ControlStatus {
  accessibilityTrusted: boolean | number;
  frontmostApplication: FrontmostApplication;
}

export type ControlRole = "button" | "menu-item" | "pop-up-button";
export type ControlMethod = "ax" | "mouse";

export interface PressResult {
  bundleIdentifier: string;
  label: string;
  matched: number;
  pressed: boolean;
  role: ControlRole;
  method?: ControlMethod;
}

export interface MatchResult {
  bundleIdentifier: string;
  label: string;
  matched: number;
  role: ControlRole;
}

export interface ActivateResult {
  activated: boolean;
  bundleIdentifier: string;
  installed: boolean;
  launched: boolean;
  running: boolean;
}

export interface SendKeyResult {
  key: string;
  modifiers: string;
  sent: boolean;
}

export interface ClearInputResult {
  bundleIdentifier: string;
  cleared: boolean;
  matched: number;
  wasEmpty: boolean;
}

export interface PreviousChatResult {
  bundleIdentifier: string;
  candidateCount: number;
  pressed: boolean;
  selectedIndex: number;
}

export interface CyclePermissionModeResult {
  availableModes: string[];
  bundleIdentifier: string;
  currentMode: string;
  selected: boolean;
  targetMode: string | null;
}

export interface ControlClient {
  status(): Promise<ControlStatus>;
  activate(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ActivateResult>;
  clearInput(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ClearInputResult>;
  match(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
  ): Promise<MatchResult>;
  key(
    key: string,
    modifiers: readonly string[],
    confirm: boolean,
  ): Promise<SendKeyResult>;
  previousChat(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<PreviousChatResult>;
  cyclePermissionMode(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<CyclePermissionModeResult>;
  press(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
    confirm: boolean,
    method?: ControlMethod,
  ): Promise<PressResult>;
}

export class MacOSControlError extends Error {
  override readonly name = "MacOSControlError";
}

export class MacOSControlClient implements ControlClient {
  constructor(
    private readonly executablePath: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async status(): Promise<ControlStatus> {
    return this.run<ControlStatus>(["status"]);
  }

  async activate(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ActivateResult> {
    return this.run<ActivateResult>([
      "activate",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async clearInput(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ClearInputResult> {
    return this.run<ClearInputResult>([
      "clear-input",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async match(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
  ): Promise<MatchResult> {
    return this.run<MatchResult>([
      "match",
      "--bundle-id",
      bundleIdentifier,
      "--role",
      role,
      "--label",
      label,
    ]);
  }

  async key(
    key: string,
    modifiers: readonly string[],
    confirm: boolean,
  ): Promise<SendKeyResult> {
    return this.run<SendKeyResult>([
      "key",
      "--key",
      key,
      "--modifiers",
      modifiers.join(","),
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async previousChat(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<PreviousChatResult> {
    return this.run<PreviousChatResult>([
      "previous-chat",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async cyclePermissionMode(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<CyclePermissionModeResult> {
    return this.run<CyclePermissionModeResult>([
      "cycle-permission-mode",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async press(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
    confirm: boolean,
    method: ControlMethod = "ax",
  ): Promise<PressResult> {
    const arguments_ = [
      "press",
      "--bundle-id",
      bundleIdentifier,
      "--role",
      role,
      "--label",
      label,
      "--method",
      method,
      ...(confirm ? ["--confirm"] : []),
    ];
    return this.run<PressResult>(arguments_);
  }

  private async run<Result>(arguments_: readonly string[]): Promise<Result> {
    const { stdout } = await runExecutable(
      this.executablePath,
      arguments_,
      this.timeoutMs,
    );
    try {
      return JSON.parse(stdout) as Result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new MacOSControlError(
        `macos-control returned invalid JSON: ${message}`,
      );
    }
  }
}

function runExecutable(
  executablePath: string,
  arguments_: readonly string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      executablePath,
      [...arguments_],
      {
        encoding: "utf8",
        maxBuffer: 1_048_576,
        timeout: timeoutMs,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(
            new MacOSControlError(
              stderr.trim()
              || `macos-control failed: ${error.message}`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}
