import { describe, expect, it, vi } from "vitest";
import {
  DualSenseFeedbackPolicy,
  type DualSenseFeedbackOutput,
} from "./feedback.js";
import type { LedReportOptions } from "./output-report.js";

class FakeOutput implements DualSenseFeedbackOutput {
  readonly calls: unknown[] = [];

  async releaseFirmwareAnimation(): Promise<void> {
    this.calls.push("release");
  }

  async reset(): Promise<void> {
    this.calls.push("reset");
  }

  async update(
    options: Omit<LedReportOptions, "layout" | "sequence">,
  ): Promise<void> {
    this.calls.push(options);
  }
}

describe("DualSenseFeedbackPolicy", () => {
  it("renders disabled and enabled states deterministically", async () => {
    const output = new FakeOutput();
    const feedback = new DualSenseFeedbackPolicy(output, async () => {});

    await feedback.initialize();
    await feedback.setEnabled(true);
    await feedback.setEnabled(false);

    expect(output.calls).toEqual([
      "release",
      "reset",
      {
        color: { r: 0, g: 25, b: 130 },
        playerLeds: 0b0_0100,
        rumble: { left: 0, right: 0 },
      },
      "reset",
    ]);
  });

  it("shows an error and restores the active state", async () => {
    const output = new FakeOutput();
    const wait = vi.fn(async () => {});
    const feedback = new DualSenseFeedbackPolicy(output, wait);

    await feedback.setEnabled(true);
    output.calls.length = 0;
    await feedback.showError();

    expect(wait).toHaveBeenCalledWith(350);
    expect(output.calls).toEqual([
      {
        color: { r: 200, g: 0, b: 0 },
        playerLeds: 0b1_1111,
        rumble: { left: 20, right: 20 },
      },
      {
        color: { r: 0, g: 25, b: 130 },
        playerLeds: 0b0_0100,
        rumble: { left: 0, right: 0 },
      },
    ]);
  });
});
