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
  MatchResult,
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
