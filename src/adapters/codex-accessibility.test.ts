import { describe, expect, it } from "vitest";
import {
  CODEX_BUNDLE_IDENTIFIER,
  CodexAccessibilityAdapter,
  CodexAccessibilityError,
} from "./codex-accessibility.js";
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
  readonly clearInputs: Array<{
    bundleIdentifier: string;
    confirm: boolean;
  }> = [];
  readonly permissionModeCycles: Array<{
    bundleIdentifier: string;
    confirm: boolean;
  }> = [];
  readonly modelPowerCalls: Array<
    | {
      operation: "inspect";
      bundleIdentifier: string;
    }
    | {
      operation: "open" | "close";
      bundleIdentifier: string;
      confirm: boolean;
    }
    | {
      operation: "adjust";
      bundleIdentifier: string;
      direction: "decrease" | "increase";
      confirm: boolean;
    }
    | {
      operation: "speed";
      bundleIdentifier: string;
      mode: "standard" | "fast";
      confirm: boolean;
    }
  > = [];
  readonly calls: Array<{
    bundleIdentifier: string;
    role: ControlRole;
    label: string;
    confirm: boolean;
    method?: ControlMethod;
  }> = [];
  readonly matches: Array<{
    bundleIdentifier: string;
    role: ControlRole;
    label: string;
  }> = [];
  readonly matchCounts = new Map<string, number>();
  readonly pressOneOfCalls: Array<{
    bundleIdentifier: string;
    role: ControlRole;
    labels: readonly string[];
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

  async clearInput(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ClearInputResult> {
    this.clearInputs.push({ bundleIdentifier, confirm });
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
    this.matches.push({ bundleIdentifier, role, label });
    return {
      bundleIdentifier,
      role,
      label,
      matched: this.matchCounts.get(label) ?? 0,
    };
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

  async cyclePermissionMode(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<CyclePermissionModeResult> {
    this.permissionModeCycles.push({ bundleIdentifier, confirm });
    return {
      availableModes: ["Ask for approval", "Approve for me", "Full access"],
      bundleIdentifier,
      currentMode: "Ask for approval",
      selected: confirm,
      targetMode: confirm ? "Approve for me" : null,
    };
  }

  async inspectModelPower(
    bundleIdentifier: string,
  ): Promise<ModelPowerInspectResult> {
    this.modelPowerCalls.push({ operation: "inspect", bundleIdentifier });
    return {
      bundleIdentifier,
      compact: false,
      open: false,
      powerMatched: 0,
      speedMode: null,
      triggerError: null,
      triggerLabel: "5.6 Sol High",
      triggerMatched: 1,
      view: "closed",
    };
  }

  async openModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerOpenResult> {
    this.modelPowerCalls.push({
      operation: "open",
      bundleIdentifier,
      confirm,
    });
    return {
      alreadyOpen: false,
      bundleIdentifier,
      compact: confirm,
      compactChanged: false,
      open: confirm,
      opened: confirm,
      triggerLabel: "5.6 Sol High",
      triggerMatched: 1,
    };
  }

  async closeModelPower(
    bundleIdentifier: string,
    confirm: boolean,
  ): Promise<ModelPowerCloseResult> {
    this.modelPowerCalls.push({
      operation: "close",
      bundleIdentifier,
      confirm,
    });
    return {
      alreadyClosed: false,
      bundleIdentifier,
      closed: confirm,
      open: !confirm,
    };
  }

  async adjustModelPower(
    bundleIdentifier: string,
    direction: "decrease" | "increase",
    confirm: boolean,
  ): Promise<ModelPowerAdjustResult> {
    this.modelPowerCalls.push({
      operation: "adjust",
      bundleIdentifier,
      direction,
      confirm,
    });
    return {
      atBoundary: false,
      bundleIdentifier,
      changed: confirm,
      compactChanged: false,
      currentValue: confirm ? "5.6 Sol Medium" : "5.6 Sol High",
      direction,
      previousValue: "5.6 Sol High",
      sent: confirm,
    };
  }

  async setModelPowerSpeed(
    bundleIdentifier: string,
    mode: "standard" | "fast",
    confirm: boolean,
  ): Promise<ModelPowerSpeedResult> {
    this.modelPowerCalls.push({
      operation: "speed",
      bundleIdentifier,
      mode,
      confirm,
    });
    return {
      alreadySelected: false,
      bundleIdentifier,
      changed: confirm,
      compactChanged: false,
      currentMode: mode === "fast" ? "standard" : "fast",
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

  async pressOneOf(
    bundleIdentifier: string,
    role: ControlRole,
    labels: readonly string[],
    confirm: boolean,
    method?: ControlMethod,
  ): Promise<PressResult> {
    this.pressOneOfCalls.push({
      bundleIdentifier,
      role,
      labels,
      confirm,
      ...(method === undefined ? {} : { method }),
    });
    const matched = labels.reduce(
      (count, label) => count + (this.matchCounts.get(label) ?? 0),
      0,
    );
    const label = labels.find(
      (candidate) => this.matchCounts.get(candidate) === 1,
    ) ?? labels[0] ?? "";
    if (matched === 1) {
      this.calls.push({
        bundleIdentifier,
        role,
        label,
        confirm,
        ...(method === undefined ? {} : { method }),
      });
    }
    return {
      bundleIdentifier,
      role,
      label,
      matched,
      pressed: confirm && matched === 1,
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

  it("clears the unique Codex input only when mutations are enabled", async () => {
    const dryRunClient = new FakeControlClient();
    const liveClient = new FakeControlClient();

    await new CodexAccessibilityAdapter(dryRunClient).clearInput();
    await new CodexAccessibilityAdapter(liveClient, true).clearInput();

    expect(dryRunClient.clearInputs).toEqual([
      { bundleIdentifier: CODEX_BUNDLE_IDENTIFIER, confirm: false },
    ]);
    expect(liveClient.clearInputs).toEqual([
      { bundleIdentifier: CODEX_BUNDLE_IDENTIFIER, confirm: true },
    ]);
  });

  it("selects the confirmed similar-command option", async () => {
    const client = new FakeControlClient();
    client.matchCounts.set("Allow similar commands", 1);
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

  it("selects the confirmed all-edits option", async () => {
    const client = new FakeControlClient();
    client.matchCounts.set("Allow all edits", 1);
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
        label: "Allow all edits",
        confirm: true,
        method: "mouse",
      },
    ]);
  });

  it("fails closed when no supported approval option exists", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await expect(adapter.allowSimilarCommands()).rejects.toThrow(
      /exactly one supported approval/,
    );

    expect(client.calls).toHaveLength(1);
    expect(client.pressOneOfCalls[0]?.labels).toEqual([
      "Allow similar commands",
      "Allow all edits",
    ]);
  });

  it("fails closed when both supported approval options exist", async () => {
    const client = new FakeControlClient();
    client.matchCounts.set("Allow similar commands", 1);
    client.matchCounts.set("Allow all edits", 1);
    const adapter = new CodexAccessibilityAdapter(client, true);

    await expect(adapter.allowSimilarCommands()).rejects.toThrow(
      /exactly one supported approval/,
    );

    expect(client.calls).toHaveLength(1);
  });

  it("fails closed when a supported approval option is ambiguous", async () => {
    const client = new FakeControlClient();
    client.matchCounts.set("Allow all edits", 2);
    const adapter = new CodexAccessibilityAdapter(client, true);

    await expect(adapter.allowSimilarCommands()).rejects.toThrow(
      /exactly one supported approval/,
    );

    expect(client.calls).toHaveLength(1);
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
    expect(client.matches).toHaveLength(0);
    expect(client.pressOneOfCalls).toHaveLength(0);
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

  it("cycles the permission mode only when mutations are enabled", async () => {
    const dryRunClient = new FakeControlClient();
    const liveClient = new FakeControlClient();

    await new CodexAccessibilityAdapter(dryRunClient).cyclePermissionMode();
    await new CodexAccessibilityAdapter(
      liveClient,
      true,
    ).cyclePermissionMode();

    expect(dryRunClient.permissionModeCycles).toEqual([
      { bundleIdentifier: CODEX_BUNDLE_IDENTIFIER, confirm: false },
    ]);
    expect(liveClient.permissionModeCycles).toEqual([
      { bundleIdentifier: CODEX_BUNDLE_IDENTIFIER, confirm: true },
    ]);
  });

  it("opens the compact model picker only when mutations are enabled", async () => {
    const dryRunClient = new FakeControlClient();
    const liveClient = new FakeControlClient();

    await expect(
      new CodexAccessibilityAdapter(dryRunClient).openModelPower(),
    ).resolves.toBe(false);
    await expect(
      new CodexAccessibilityAdapter(liveClient, true).openModelPower(),
    ).resolves.toBe(true);

    expect(dryRunClient.modelPowerCalls).toEqual([
      {
        operation: "open",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        confirm: false,
      },
    ]);
    expect(liveClient.modelPowerCalls).toEqual([
      {
        operation: "open",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        confirm: true,
      },
    ]);
  });

  it("adjusts compact Power in both directions", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.adjustModelPower(-1);
    await adapter.adjustModelPower(1);

    expect(client.modelPowerCalls).toEqual([
      {
        operation: "adjust",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        direction: "decrease",
        confirm: true,
      },
      {
        operation: "adjust",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        direction: "increase",
        confirm: true,
      },
    ]);
  });

  it("accepts a Power endpoint as a successful no-op", async () => {
    const client = new FakeControlClient();
    client.adjustModelPower = async (
      bundleIdentifier,
      direction,
      confirm,
    ) => ({
      atBoundary: true,
      bundleIdentifier,
      changed: false,
      compactChanged: false,
      currentValue: "5.6 Sol High",
      direction,
      previousValue: "5.6 Sol High",
      sent: confirm,
    });

    await expect(
      new CodexAccessibilityAdapter(client, true).adjustModelPower(1),
    ).resolves.toBeUndefined();
  });

  it("selects compact Fast and Standard modes", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.setModelPowerSpeed("fast");
    await adapter.setModelPowerSpeed("standard");

    expect(client.modelPowerCalls).toEqual([
      {
        operation: "speed",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        mode: "fast",
        confirm: true,
      },
      {
        operation: "speed",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        mode: "standard",
        confirm: true,
      },
    ]);
  });

  it("accepts an already-selected speed as an idempotent success", async () => {
    const client = new FakeControlClient();
    client.setModelPowerSpeed = async (
      bundleIdentifier,
      mode,
    ) => ({
      alreadySelected: true,
      bundleIdentifier,
      changed: false,
      compactChanged: false,
      currentMode: mode,
      selected: true,
      targetMode: mode,
    });

    await expect(
      new CodexAccessibilityAdapter(client, true).setModelPowerSpeed("fast"),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the model shortcut does not open the picker", async () => {
    const client = new FakeControlClient();
    client.openModelPower = async (
      bundleIdentifier,
    ) => ({
      alreadyOpen: false,
      bundleIdentifier,
      compact: false,
      compactChanged: false,
      open: false,
      opened: false,
      triggerLabel: null,
      triggerMatched: 0,
    });

    await expect(
      new CodexAccessibilityAdapter(client, true).openModelPower(),
    ).rejects.toThrow(/did not open/);
  });

  it("closes the compact model picker idempotently", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.closeModelPower();

    expect(client.modelPowerCalls).toEqual([
      {
        operation: "close",
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        confirm: true,
      },
    ]);
  });

  it("toggles back and forward without synthesizing Command key events", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.toggleLastTask();
    await adapter.toggleLastTask();
    await adapter.toggleLastTask();

    expect(client.calls).toEqual([
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Previous Chat",
        confirm: true,
        method: "ax",
      },
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Next Chat",
        confirm: true,
        method: "ax",
      },
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Previous Chat",
        confirm: true,
        method: "ax",
      },
    ]);
    expect(client.keys).toHaveLength(0);
  });

  it("uses Codex menu actions for bidirectional navigation", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.switchSession(-1);
    await adapter.switchSession(1);

    expect(client.calls).toEqual([
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Previous Chat",
        confirm: true,
        method: "ax",
      },
      {
        bundleIdentifier: CODEX_BUNDLE_IDENTIFIER,
        role: "menu-item",
        label: "Next Chat",
        confirm: true,
        method: "ax",
      },
    ]);
    expect(client.keys).toHaveLength(0);
    expect(client.previousChats).toHaveLength(0);
  });

  it("restarts the L1 toggle from previous after D-pad navigation", async () => {
    const client = new FakeControlClient();
    const adapter = new CodexAccessibilityAdapter(client, true);

    await adapter.toggleLastTask();
    await adapter.switchSession(1);
    await adapter.toggleLastTask();

    expect(client.calls.map(({ label }) => label)).toEqual([
      "Previous Chat",
      "Next Chat",
      "Previous Chat",
    ]);
  });
});
