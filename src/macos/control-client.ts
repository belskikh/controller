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

export interface ModelPowerInspectResult {
  bundleIdentifier: string;
  compact: boolean | number;
  open: boolean | number;
  powerMatched: number;
  speedMode: "standard" | "fast" | null;
  triggerError: string | null;
  triggerLabel: string | null;
  triggerMatched: number;
  view: "closed" | "compact" | "advanced";
}

export interface ModelPowerOpenResult {
  alreadyOpen: boolean;
  bundleIdentifier: string;
  compact: boolean;
  compactChanged: boolean;
  open: boolean | number;
  opened: boolean;
  triggerLabel: string | null;
  triggerMatched: number;
}

export interface ModelPowerCloseResult {
  alreadyClosed: boolean;
  bundleIdentifier: string;
  closed: boolean;
  open: boolean | number;
}

export interface ModelPowerAdjustResult {
  atBoundary: boolean | number | null;
  bundleIdentifier: string;
  changed: boolean | null;
  compactChanged: boolean;
  currentValue: string | null;
  direction: "decrease" | "increase";
  previousValue: string | null;
  sent: boolean;
}

export interface ModelPowerSpeedResult {
  alreadySelected: boolean;
  bundleIdentifier: string;
  changed: boolean;
  compactChanged: boolean;
  currentMode: "standard" | "fast";
  selected: boolean;
  targetMode: "standard" | "fast";
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
  inspectModelPower(
    bundleIdentifier: string,
  ): Promise<ModelPowerInspectResult>;
  openModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerOpenResult>;
  closeModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerCloseResult>;
  adjustModelPower(
    bundleIdentifier: string,
    direction: "decrease" | "increase",
    confirm: boolean,
  ): Promise<ModelPowerAdjustResult>;
  setModelPowerSpeed(
    bundleIdentifier: string,
    mode: "standard" | "fast",
    confirm: boolean,
  ): Promise<ModelPowerSpeedResult>;
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

  async inspectModelPower(
    bundleIdentifier: string,
  ): Promise<ModelPowerInspectResult> {
    return this.run<ModelPowerInspectResult>([
      "model-power",
      "inspect",
      "--bundle-id",
      bundleIdentifier,
    ]);
  }

  async openModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerOpenResult> {
    return this.run<ModelPowerOpenResult>([
      "model-power",
      "open",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async closeModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerCloseResult> {
    return this.run<ModelPowerCloseResult>([
      "model-power",
      "close",
      "--bundle-id",
      bundleIdentifier,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async adjustModelPower(
    bundleIdentifier: string,
    direction: "decrease" | "increase",
    confirm: boolean,
  ): Promise<ModelPowerAdjustResult> {
    return this.run<ModelPowerAdjustResult>([
      "model-power",
      "adjust",
      "--bundle-id",
      bundleIdentifier,
      "--direction",
      direction,
      ...(confirm ? ["--confirm"] : []),
    ]);
  }

  async setModelPowerSpeed(
    bundleIdentifier: string,
    mode: "standard" | "fast",
    confirm: boolean,
  ): Promise<ModelPowerSpeedResult> {
    return this.run<ModelPowerSpeedResult>([
      "model-power",
      "speed",
      "--bundle-id",
      bundleIdentifier,
      "--mode",
      mode,
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
