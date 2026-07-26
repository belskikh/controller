import type { LedReportOptions } from "./output-report.js";

export interface DualSenseFeedbackOutput {
  releaseFirmwareAnimation(): Promise<void>;
  reset(): Promise<void>;
  update(
    options: Omit<LedReportOptions, "layout" | "sequence">,
  ): Promise<void>;
}

export class DualSenseFeedbackPolicy {
  private enabled = false;

  constructor(
    private readonly output: DualSenseFeedbackOutput,
    private readonly wait: (milliseconds: number) => Promise<void>,
  ) {}

  async initialize(): Promise<void> {
    await this.output.releaseFirmwareAnimation();
    await this.output.reset();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    await this.render(false);
  }

  async showError(): Promise<void> {
    await this.output.update({
      color: { r: 200, g: 0, b: 0 },
      playerLeds: 0b1_1111,
      rumble: { left: 20, right: 20 },
    });
    await this.wait(350);
    await this.render(true);
  }

  async showAttention(): Promise<void> {
    const pulse = async (): Promise<void> => {
      await this.output.update({
        rumble: { left: 0.22, right: 0.35 },
      });
      await this.wait(160);
    };
    await pulse();
    await this.output.update({
      rumble: { left: 0, right: 0 },
    });
    await this.wait(100);
    await pulse();
    await this.render(true);
  }

  async shutdown(): Promise<void> {
    this.enabled = false;
    await this.output.reset();
  }

  private async render(stopRumble: boolean): Promise<void> {
    await this.output.update({
      color: this.enabled
        ? { r: 0, g: 25, b: 130 }
        : { r: 0, g: 0, b: 0 },
      playerLeds: this.enabled ? 0b0_0100 : 0,
      ...(stopRumble
        ? { rumble: { left: 0, right: 0 } }
        : {}),
    });
  }
}
