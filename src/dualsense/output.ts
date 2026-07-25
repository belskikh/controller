import type { NodeHIDProvider } from "dualsense-ts";
import {
  buildBluetoothLedReport,
  type LedReportOptions,
  type RGB,
} from "./output-report.js";
import { delay } from "./bluetooth.js";

export class BluetoothDualSenseOutput {
  private sequence = 0;

  constructor(private readonly provider: NodeHIDProvider) {}

  async releaseFirmwareAnimation(): Promise<void> {
    await this.send({ releaseAnimation: true });
    await delay(350);
  }

  async setColor(color: RGB): Promise<void> {
    await this.send({ color });
  }

  async setPlayerLeds(bitmask: number): Promise<void> {
    await this.send({ playerLeds: bitmask });
  }

  async setRumble(left: number, right = left): Promise<void> {
    await this.send({ rumble: { left, right } });
  }

  async update(
    options: Omit<LedReportOptions, "layout" | "sequence">,
  ): Promise<void> {
    await this.send(options);
  }

  async reset(): Promise<void> {
    await this.send({
      color: { r: 0, g: 0, b: 0 },
      playerLeds: 0,
      rumble: { left: 0, right: 0 },
    });
    await delay(120);
  }

  private async send(
    options: Omit<LedReportOptions, "layout" | "sequence">,
  ): Promise<void> {
    await this.provider.write(
      buildBluetoothLedReport({
        layout: "sony",
        sequence: this.sequence,
        ...options,
      }),
    );
    this.sequence = (this.sequence + 1) & 0x0f;
  }
}
