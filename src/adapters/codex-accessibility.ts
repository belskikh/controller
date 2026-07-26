import type { AgentAdapter } from "./agent-adapter.js";
import type {
  ControlClient,
  ControlRole,
} from "../macos/control-client.js";

export const CODEX_BUNDLE_IDENTIFIER = "com.openai.codex";

export interface CodexControlLabels {
  accept: string;
  approvalOptions: string;
  allowAllEdits: string;
  allowSimilarCommands: string;
  decline: string;
  interrupt: string;
  newThread: string;
  nextThread: string;
  previousThread: string;
}

export const DEFAULT_CODEX_CONTROL_LABELS: CodexControlLabels = {
  accept: "Allow once",
  approvalOptions: "Approval options",
  allowAllEdits: "Allow all edits",
  allowSimilarCommands: "Allow similar commands",
  decline: "Deny",
  interrupt: "Stop",
  newThread: "New Chat",
  nextThread: "Next Chat",
  previousThread: "Previous Chat",
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
      await this.pressApprovalOption();
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

  async openModelPower(): Promise<boolean> {
    await this.assertFrontmost();
    const result = await this.client.openModelPower(
      CODEX_BUNDLE_IDENTIFIER,
      this.mutationsEnabled,
    );
    const active = Boolean(result.open) && result.compact;
    if (this.mutationsEnabled && !active) {
      throw new CodexAccessibilityError(
        "The compact model picker did not open.",
      );
    }
    return active;
  }

  async closeModelPower(): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.closeModelPower(
      CODEX_BUNDLE_IDENTIFIER,
      this.mutationsEnabled,
    );
    if (
      this.mutationsEnabled
      && !result.closed
      && !result.alreadyClosed
    ) {
      throw new CodexAccessibilityError(
        "The model picker did not close.",
      );
    }
  }

  async adjustModelPower(direction: -1 | 1): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.adjustModelPower(
      CODEX_BUNDLE_IDENTIFIER,
      direction === -1 ? "decrease" : "increase",
      this.mutationsEnabled,
    );
    if (result.sent !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        "Unexpected model Power adjustment result.",
      );
    }
  }

  async setModelPowerSpeed(mode: "standard" | "fast"): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.setModelPowerSpeed(
      CODEX_BUNDLE_IDENTIFIER,
      mode,
      this.mutationsEnabled,
    );
    if (result.alreadySelected) {
      if (!result.selected || result.changed) {
        throw new CodexAccessibilityError(
          "Unexpected idempotent model speed result.",
        );
      }
      return;
    }
    if (
      result.changed !== this.mutationsEnabled
      || result.selected !== this.mutationsEnabled
    ) {
      throw new CodexAccessibilityError(
        `The ${mode} model speed could not be selected.`,
      );
    }
  }

  async cyclePermissionMode(): Promise<void> {
    await this.assertFrontmost();
    const result = await this.client.cyclePermissionMode(
      CODEX_BUNDLE_IDENTIFIER,
      this.mutationsEnabled,
    );
    if (result.selected !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        "The Codex permission mode could not be changed.",
      );
    }
  }

  async newThread(): Promise<void> {
    await this.press("menu-item", this.labels.newThread);
  }

  async toggleLastTask(): Promise<void> {
    const direction = this.lastTaskToggleDirection;
    await this.navigateSession(direction);
    this.lastTaskToggleDirection = direction === -1 ? 1 : -1;
  }

  async switchSession(direction: -1 | 1): Promise<void> {
    await this.navigateSession(direction);
    this.lastTaskToggleDirection = -1;
  }

  private async navigateSession(direction: -1 | 1): Promise<void> {
    const label = direction === -1
      ? this.labels.previousThread
      : this.labels.nextThread;
    await this.press("menu-item", label);
  }

  private async pressApprovalOption(): Promise<void> {
    const labels = [
      this.labels.allowSimilarCommands,
      this.labels.allowAllEdits,
    ];
    await this.assertFrontmost();
    const result = await this.client.pressOneOf(
      CODEX_BUNDLE_IDENTIFIER,
      "menu-item",
      labels,
      this.mutationsEnabled,
      "mouse",
    );
    if (result.matched !== 1 || !labels.includes(result.label)) {
      throw new CodexAccessibilityError(
        "Expected exactly one supported approval menu item.",
      );
    }
    if (result.pressed !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        `Unexpected press result for "${result.label}".`,
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
      role === "menu-item"
          && label !== this.labels.allowSimilarCommands
          && label !== this.labels.allowAllEdits
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
