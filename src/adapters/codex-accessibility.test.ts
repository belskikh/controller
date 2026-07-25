import { describe, expect, it } from "vitest";
import {
  CODEX_BUNDLE_IDENTIFIER,
  CodexAccessibilityAdapter,
  CodexAccessibilityError,
} from "./codex-accessibility.js";
import type {
  ActivateResult,
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
  readonly activations: Array<{
    bundleIdentifier: string;
    confirm: boolean;
  }> = [];
  readonly keys: Array<{
    key: string;
    modifiers: readonly string[];
    confirm: boolean;
  }> = [];
  readonly previousChats: Array<{
    bundleIdentifier: string;
    confirm: boolean;
  }> = [];
  readonly calls: Array<{
    bundleIdentifier: string;
    role: ControlRole;
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
    this.activations.push({ bundleIdentifier, confirm });
    return {
      activated: confirm,
      bundleIdentifier,
      installed: true,
      launched: false,
      running: true,
    };
  }

  async match(
    bundleIdentifier: string,
    role: ControlRole,
    label: string,
  ): Promise<MatchResult> {
    return { bundleIdentifier, role, label, matched: 1 };
  }

  async key(
    key: string,
    modifiers: readonly string[],
    confirm: boolean,
  ): Promise<SendKeyResult> {
    this.keys.push({ key, modifiers, confirm });
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
    this.previousChats.push({ bundleIdentifier, confirm });
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
    this.calls.push({
      bundleIdentifier,
      role,
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

describe("CodexAccessibilityAdapter", () => {
  it("is dry-run by default", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client);

    await adapter.newThread();

    expect(client.calls).toEqual([
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "New Chat",
        confirm: false,
        method: "ax",
      },
    ]);
  });

  it("confirms actions only when mutations are enabled", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.accept();

    expect(client.calls[0]?.confirm).toBe(true);
    expect(client.calls[0]?.method).toBe("mouse");
    expect(client.calls[0]?.label).toBe("Allow once");
  });

  it("selects the confirmed similar-command option", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.allowSimilarCommands();

    expect(client.calls).toEqual([
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "pop-up-button",
        label: "Approval options",
        confirm: true,
        method: "mouse",
      },
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Allow similar commands",
        confirm: true,
        method: "mouse",
      },
    ]);
  });

  it("does not open the approval menu in dry-run mode", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client);

    await adapter.allowSimilarCommands();

    expect(client.calls).toEqual([
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "pop-up-button",
        label: "Approval options",
        confirm: false,
        method: "mouse",
      },
    ]);
  });

  it("fails closed when Codex is not frontmost", async () => {
    const client = new FakeControlClient();
    client.statusValue = {
      accessibilityTrusted: true,
      frontmostApplication: {
        bundleIdentifier: "com.apple.finder",
        name: "Finder",
        pid: 456,
      },
    };
    const adapter = new CodexAccessibilityAdapter(client);

    await expect(adapter.accept()).rejects.toBeInstanceOf(
      CodexAccessibilityError,
    );
    expect(client.calls).toHaveLength(0);
  });

  it("fails closed without Accessibility permission", async () => {
    const client = new FakeControlClient();
    client.statusValue = {
      accessibilityTrusted: false,
      frontmostApplication: {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        name: "ChatGPT",
        pid: 123,
      },
    };
    const adapter = new CodexAccessibilityAdapter(client);

    await expect(adapter.accept()).rejects.toThrow(/permission/);
    expect(client.calls).toHaveLength(0);
  });

  it("can focus Codex without requiring it to be frontmost first", async () => {
    const client = new FakeControlClient();
    client.statusValue = {
      accessibilityTrusted: true,
      frontmostApplication: {
        bundleIdentifier: "com.apple.finder",
        name: "Finder",
        pid: 456,
      },
    };
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.focus();

    expect(client.activations).toEqual([
      { bundleIdentifier: CODEX_BUNDLE_IDENTIFIER, confirm: true },
    ]);
  });

  it("toggles back and forward between the last two tasks", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.toggleLastTask();
    await adapter.toggleLastTask();
    await adapter.toggleLastTask();

    expect(client.keys).toEqual([
      { key: "[", modifiers: ["cmd", "shift"], confirm: true },
      { key: "]", modifiers: ["cmd", "shift"], confirm: true },
      { key: "[", modifiers: ["cmd", "shift"], confirm: true },
    ]);
  });

  it("uses Codex history shortcuts for bidirectional navigation", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.switchSession(-1);
    await adapter.switchSession(1);

    expect(client.keys).toEqual([
      { key: "[", modifiers: ["cmd", "shift"], confirm: true },
      { key: "]", modifiers: ["cmd", "shift"], confirm: true },
    ]);
    expect(client.previousChats).toHaveLength(0);
  });

  it("restarts the L1 toggle from previous after D-pad navigation", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.toggleLastTask();
    await adapter.switchSession(1);
    await adapter.toggleLastTask();

    expect(client.keys.map(({ key }) => key)).toEqual(["[", "]", "["]);
  });
});
