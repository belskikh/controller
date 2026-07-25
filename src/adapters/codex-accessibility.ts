import type { AgentAdapter } from "./agent-adapter.js";
import type {
  ControlClient,
  ControlRole,
} from "../macos/control-client.js";

export const CODEX_BUNDLE_IDENTIFIER = "com.openai.codex";

export interface CodexControlLabels {
  accept: string;
  approvalOptions: string;
  allowSimilarCommands: string;
  decline: string;
  interrupt: string;
  newThread: string;
}

export const DEFAULT_CODEX_CONTROL_LABELS: CodexControlLabels = {
  accept: "Allow once",
  approvalOptions: "Approval options",
  allowSimilarCommands: "Allow similar commands",
  decline: "Deny",
  interrupt: "Stop",
  newThread: "New Chat",
};

export class CodexAccessibilityError extends Error {
  override readonly name = "CodexAccessibilityError";
}

export class CodexAccessibilityAdapter implements AgentAdapter {
  private lastTaskToggleDirection: -1 | 1 = -1;

  constructor(
    private readonly client: ControlClient,
    private readonly mutationsEnabled = false,
    private readonly labels = DEFAULT_CODEX_CONTROL_LABELS,
  ) {}

  async isFrontmost(): Promise<boolean> {
    const status = await this.client.status();
    return (
      status.frontmostApplication.bundleIdentifier
      === CODEX_BUNDLE_IDENTIFIER
    );
  }

  async accept(): Promise<void> {
    await this.press("button", this.labels.accept);
  }

  async allowSimilarCommands(): Promise<void> {
    await this.press("pop-up-button", this.labels.approvalOptions);
    if (this.mutationsEnabled) {
      await this.press("menu-item", this.labels.allowSimilarCommands);
    }
  }

  async clearInput(): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.clearInput(
      CODEX_BUNDLE_IDENTIFIER,
      this.mutationsEnabled,
    );
    if (result.matched !== 1) {
      throw new CodexAccessibilityError(
        "Expected exactly one editable Codex input field.",
      );
    }
    if (result.cleared !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        "Unexpected clear-input result.",
      );
    }
  }

  async decline(): Promise<void> {
    await this.press("button", this.labels.decline);
  }

  async focus(): Promise<void> {
    const result = await this.client.activate(
      CODEX_BUNDLE_IDENTIFIER,
      this.mutationsEnabled,
    );
    if (
      !result.installed
      || !result.running
      || result.activated !== this.mutationsEnabled
    ) {
      throw new CodexAccessibilityError(
        "Codex could not be activated.",
      );
    }
  }

  async interrupt(): Promise<void> {
    await this.press("button", this.labels.interrupt);
  }

  async newThread(): Promise<void> {
    await this.press("menu-item", this.labels.newThread);
  }

  async toggleLastTask(): Promise<void> {
    const direction = this.lastTaskToggleDirection;
    await this.sendSessionShortcut(direction);
    this.lastTaskToggleDirection = direction === -1 ? 1 : -1;
  }

  async switchSession(direction: -1 | 1): Promise<void> {
    await this.sendSessionShortcut(direction);
    this.lastTaskToggleDirection = -1;
  }

  private async sendSessionShortcut(direction: -1 | 1): Promise<void> {
    await this.assertFrontmost();
    const key = direction === -1 ? "[" : "]";
    const result = await this.client.key(
      key,
      ["cmd", "shift"],
      this.mutationsEnabled,
    );
    if (result.sent !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        `Unexpected shortcut result for "${key}".`,
      );
    }
  }

  private async press(role: ControlRole, label: string): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.press(
      CODEX_BUNDLE_IDENTIFIER,
      role,
      label,
      this.mutationsEnabled,
      role === "menu-item" && label !== this.labels.allowSimilarCommands
        ? "ax"
        : "mouse",
    );
    if (result.matched !== 1) {
      throw new CodexAccessibilityError(
        `Expected exactly one ${role} named "${label}".`,
      );
    }
    if (result.pressed !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        `Unexpected press result for "${label}".`,
      );
    }
  }

  private async assertFrontmost(): Promise<void> {
    const status = await this.client.status();
    if (!Boolean(status.accessibilityTrusted)) {
      throw new CodexAccessibilityError(
        "macOS Accessibility permission is not granted.",
      );
    }
    if (
      status.frontmostApplication.bundleIdentifier
      !== CODEX_BUNDLE_IDENTIFIER
    ) {
      throw new CodexAccessibilityError(
        `Codex is not frontmost; found ${
          status.frontmostApplication.bundleIdentifier ?? "no application"
        }.`,
      );
    }
  }
}
