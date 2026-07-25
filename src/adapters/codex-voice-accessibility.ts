import {
  CODEX_BUNDLE_IDENTIFIER,
  CodexAccessibilityError,
} from "./codex-accessibility.js";
import type { ControlClient } from "../macos/control-client.js";

export interface CodexVoiceControlLabels {
  cancel: string;
  finish: string;
  start: string;
}

export const DEFAULT_CODEX_VOICE_CONTROL_LABELS: CodexVoiceControlLabels = {
  cancel: "Stop dictation",
  finish: "Transcribe and send",
  start: "Dictate",
};

export class CodexVoiceAccessibilityAdapter {
  constructor(
    private readonly client: ControlClient,
    private readonly mutationsEnabled = false,
    private readonly labels = DEFAULT_CODEX_VOICE_CONTROL_LABELS,
  ) {}

  async toggle(): Promise<void> {
    await this.assertReady();
    const [start, finish] = await Promise.all([
      this.client.match(
        CODEX_BUNDLE_IDENTIFIER,
        "button",
        this.labels.start,
      ),
      this.client.match(
        CODEX_BUNDLE_IDENTIFIER,
        "button",
        this.labels.finish,
      ),
    ]);
    if (start.matched + finish.matched !== 1) {
      throw new CodexAccessibilityError(
        "Expected exactly one Codex dictation state control.",
      );
    }
    await this.press(start.matched === 1 ? this.labels.start : this.labels.finish);
  }

  async cancel(): Promise<void> {
    await this.assertReady();
    const result = await this.client.match(
      CODEX_BUNDLE_IDENTIFIER,
      "button",
      this.labels.cancel,
    );
    if (result.matched === 0) {
      return;
    }
    if (result.matched !== 1) {
      throw new CodexAccessibilityError(
        `Expected at most one button named "${this.labels.cancel}".`,
      );
    }
    await this.press(this.labels.cancel);
  }

  private async assertReady(): Promise<void> {
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

  private async press(label: string): Promise<void> {
    const result = await this.client.press(
      CODEX_BUNDLE_IDENTIFIER,
      "button",
      label,
      this.mutationsEnabled,
      "mouse",
    );
    if (result.matched !== 1 || result.pressed !== this.mutationsEnabled) {
      throw new CodexAccessibilityError(
        `Unexpected press result for "${label}".`,
      );
    }
  }
}
