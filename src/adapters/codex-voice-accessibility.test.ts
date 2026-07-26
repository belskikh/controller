import { describe, expect, it } from "vitest";
import {
  CODEX_BUNDLE_IDENTIFIER,
  CodexAccessibilityError,
} from "./codex-accessibility.js";
import { CodexVoiceAccessibilityAdapter } from "./codex-voice-accessibility.js";
import type {
  ActivateResult,
  ClearInputResult,
  ControlClient,
  ControlMethod,
  ControlRole,
  ControlStatus,
  CyclePermissionModeResult,
  MatchResult,
  ModelPowerAdjustResult,
  ModelPowerCloseResult,
  ModelPowerInspectResult,
  ModelPowerOpenResult,
  ModelPowerSpeedResult,
  PreviousChatResult,
  PressResult,
  SendKeyResult,
} from "../macos/control-client.js";

class FakeControlClient implements ControlClient {
  readonly matches = new Map<string, number>([
    ["Dictate", 1],
    ["Transcribe and send", 0],
    ["Stop dictation", 0],
  ]);
  readonly presses: Array<{
    label: string;
    confirm: boolean;
    method?: ControlMethod;
  }> = [];
  statusValue: ControlStatus = {
    accessibilityTrusted: true,
    frontmostApplication: {
      bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
      name: "ChatGPT",
      pid: 123,
    },
  };

  async status(): Promise<ControlStatus> {
    return this.statusValue;
  }

  async activate(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ActivateResult> {
    return {
      activated: confirm,
      bundleIdentifier,
      installed: true,
      launched: false,
      running: true,
    };
  }

  async clearInput(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ClearInputResult> {
    return {
      bundleIdentifier,
      cleared: confirm,
      matched: 1,
      wasEmpty: false,
    };
  }

  async match(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
  ): Promise<MatchResult> {
    return {
      bundleIdentifier,
      role,
      label,
      matched: this.matches.get(label) ?? 0,
    };
  }

  async key(
    key: string,
    modifiers: readonly string[],
    confirm: boolean,
  ): Promise<SendKeyResult> {
    return {
      key,
      modifiers: modifiers.join(","),
      sent: confirm,
    };
  }

  async previousChat(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<PreviousChatResult> {
    return {
      bundleIdentifier,
      candidateCount: 2,
      pressed: confirm,
      selectedIndex: 1,
    };
  }

  async cyclePermissionMode(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<CyclePermissionModeResult> {
    return {
      availableModes: ["Ask for approval"],
      bundleIdentifier,
      currentMode: "Ask for approval",
      selected: confirm,
      targetMode: null,
    };
  }

  async inspectModelPower(
    bundleIdentifier: string,
  ): Promise<ModelPowerInspectResult> {
    return {
      bundleIdentifier,
      compact: false,
      open: 0,
      powerMatched: 0,
      speedMode: null,
      triggerError: null,
      triggerLabel: null,
      triggerMatched: 0,
      view: "closed",
    };
  }

  async openModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerOpenResult> {
    return {
      alreadyOpen: false,
      bundleIdentifier,
      compact: confirm,
      compactChanged: false,
      open: confirm ? 1 : 0,
      opened: confirm,
      triggerLabel: null,
      triggerMatched: 1,
    };
  }

  async closeModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerCloseResult> {
    return {
      alreadyClosed: !confirm,
      bundleIdentifier,
      closed: confirm,
      open: confirm ? 0 : 1,
    };
  }

  async adjustModelPower(
    bundleIdentifier: string,
    direction: "decrease" | "increase",
    confirm: boolean,
  ): Promise<ModelPowerAdjustResult> {
    return {
      atBoundary: false,
      bundleIdentifier,
      changed: confirm,
      compactChanged: false,
      currentValue: "",
      direction,
      previousValue: "",
      sent: confirm,
    };
  }

  async setModelPowerSpeed(
    bundleIdentifier: string,
    mode: "standard" | "fast",
    confirm: boolean,
  ): Promise<ModelPowerSpeedResult> {
    return {
      alreadySelected: !confirm,
      bundleIdentifier,
      changed: confirm,
      compactChanged: false,
      currentMode: mode,
      selected: confirm,
      targetMode: mode,
    };
  }

  async press(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
    confirm: boolean,
    method?: ControlMethod,
  ): Promise<PressResult> {
    this.presses.push({
      label,
      confirm,
      ...(method === undefined ? {} : { method }),
    });
    return {
      bundleIdentifier,
      role,
      label,
      matched: 1,
      pressed: confirm,
    };
  }
}

describe("CodexVoiceAccessibilityAdapter", () => {
  it("starts dictation from the idle state", async () => {
    const client = new FakeControlClient();
    const voice = new CodexVoiceAccessibilityAdapter(client, true);

    await voice.toggle();

    expect(client.presses).toEqual([
      { label: "Dictate", confirm: true, method: "mouse" },
    ]);
  });

  it("transcribes and sends from the recording state", async () => {
    const client = new FakeControlClient();
    client.matches.set("Dictate", 0);
    client.matches.set("Transcribe and send", 1);
    const voice = new CodexVoiceAccessibilityAdapter(client, true);

    await voice.toggle();

    expect(client.presses).toEqual([
      { label: "Transcribe and send", confirm: true, method: "mouse" },
    ]);
  });

  it("cancels only when dictation is active", async () => {
    const client = new FakeControlClient();
    const voice = new CodexVoiceAccessibilityAdapter(client, true);

    await voice.cancel();
    client.matches.set("Stop dictation", 1);
    await voice.cancel();

    expect(client.presses).toEqual([
      { label: "Stop dictation", confirm: true, method: "mouse" },
    ]);
  });

  it("silently skips focus-loss cleanup after Codex is no longer frontmost", async () => {
    const client = new FakeControlClient();
    client.matches.set("Stop dictation", 1);
    client.statusValue = {
      accessibilityTrusted: true,
      frontmostApplication: {
        bundleIdentifier: "org.mozilla.firefox",
        name: "Firefox",
        pid: 456,
      },
    };
    const voice = new CodexVoiceAccessibilityAdapter(client, true);

    await voice.cancel();

    expect(client.presses).toHaveLength(0);
  });

  it("fails closed for an ambiguous UI state", async () => {
    const client = new FakeControlClient();
    client.matches.set("Transcribe and send", 1);
    const voice = new CodexVoiceAccessibilityAdapter(client, true);

    await expect(voice.toggle()).rejects.toBeInstanceOf(
      CodexAccessibilityError,
    );
    expect(client.presses).toHaveLength(0);
  });
});
