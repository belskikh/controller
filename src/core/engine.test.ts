import { describe, expect, it } from "vitest";
import type { ControllerConfig } from "./types.js";
import { ControllerEngine } from "./engine.js";

const config: ControllerConfig = {
  version: 1,
  startEnabled: false,
  debounceMs: 80,
  bindings: {
    cross: { press: "accept" },
    mute: { press: "voice.cancel" },
    "dpad.up": { press: "switchPrevious" },
    "dpad.left": { press: "permissionMode.next" },
    "dpad.right": { press: "voice.toggle" },
    circle: { press: "focusCodex" },
    triangle: { press: "clearInput" },
  },
};

describe("ControllerEngine", () => {
  it("starts disabled and only allows the Codex activator", () => {
    const engine = new ControllerEngine(config);
    expect(engine.handle({ control: "cross", phase: "press" }, 100)).toEqual([
      { type: "ignored", reason: "disabled" },
    ]);
    expect(engine.handle({ control: "circle", phase: "press" }, 100)).toEqual([
      { type: "action", action: "focusCodex" },
    ]);
    expect(engine.synchronizeEnabled(true)).toEqual([
      { type: "state", enabled: true },
    ]);
    expect(engine.handle({ control: "cross", phase: "press" }, 200)).toEqual([
      { type: "action", action: "accept" },
    ]);
  });

  it("blocks navigation until Codex is frontmost", () => {
    const engine = new ControllerEngine(config);

    expect(
      engine.handle({ control: "dpad.up", phase: "press" }, 200),
    ).toEqual([
      { type: "ignored", reason: "disabled" },
    ]);
    engine.synchronizeEnabled(true);
    expect(
      engine.handle({ control: "dpad.up", phase: "press" }, 300),
    ).toEqual([
      { type: "action", action: "switchPrevious" },
    ]);
  });

  it("debounces repeated physical events", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });
    engine.handle({ control: "cross", phase: "press" }, 100);
    expect(engine.handle({ control: "cross", phase: "press" }, 150)).toEqual([
      { type: "ignored", reason: "debounced" },
    ]);
    expect(engine.handle({ control: "cross", phase: "press" }, 180)).toEqual([
      { type: "action", action: "accept" },
    ]);
  });

  it("cancels dictation when Codex stops being frontmost", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });
    expect(engine.handle({ control: "dpad.right", phase: "press" }, 100)).toEqual([
      { type: "action", action: "voice.toggle" },
    ]);
    expect(engine.synchronizeEnabled(false)).toEqual([
      { type: "state", enabled: false },
      { type: "action", action: "voice.cancel" },
    ]);
  });

  it("maps the microphone button to an explicit cancel", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });
    expect(engine.handle({ control: "mute", phase: "press" }, 100)).toEqual([
      { type: "action", action: "voice.cancel" },
    ]);
  });

  it("maps D-pad left to cycling the Codex permission mode", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    expect(
      engine.handle({ control: "dpad.left", phase: "press" }, 100),
    ).toEqual([
      { type: "action", action: "permissionMode.next" },
    ]);
  });

  it("maps triangle to clearing the Codex input", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    expect(engine.handle({ control: "triangle", phase: "press" }, 100)).toEqual([
      { type: "action", action: "clearInput" },
    ]);
  });
});
