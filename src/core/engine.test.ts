import { describe, expect, it } from "vitest";
import type { ControllerConfig } from "./types.js";
import { ControllerEngine } from "./engine.js";

const config: ControllerConfig = {
  version: 1,
  startEnabled: false,
  debounceMs: 80,
  bindings: {
    "left.stick.button": { press: "modelPower.toggle" },
    mute: { press: "voice.cancel" },
    "dpad.up": { press: "switchPrevious" },
    "dpad.left": { press: "permissionMode.next" },
    "dpad.right": { press: "voice.toggle" },
    circle: { press: "focusCodex" },
    triangle: { press: "clearInput" },
    "touchpad.button": { press: "pointer.click" },
  },
};

describe("ControllerEngine", () => {
  it("starts disabled and only allows the Codex activator", () => {
    const engine = new ControllerEngine(config);
    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 100),
    ).toEqual([
      { type: "ignored", reason: "disabled" },
    ]);
    expect(engine.handle({ control: "circle", phase: "press" }, 100)).toEqual([
      { type: "action", action: "focusCodex" },
    ]);
    expect(engine.synchronizeEnabled(true)).toEqual([
      { type: "state", enabled: true },
    ]);
    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 200),
    ).toEqual([
      { type: "action", action: "modelPower.open" },
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
    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    engine.synchronizeModelPower(true);
    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 150),
    ).toEqual([
      { type: "ignored", reason: "debounced" },
    ]);
    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 180),
    ).toEqual([
      { type: "action", action: "modelPower.close" },
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

  it("keeps touchpad clicks behind the frontmost-Codex gate", () => {
    const engine = new ControllerEngine(config);
    const event = { control: "touchpad.button", phase: "press" } as const;

    expect(engine.handle(event, 100)).toEqual([
      { type: "ignored", reason: "disabled" },
    ]);
    engine.synchronizeEnabled(true);
    expect(engine.handle(event, 200)).toEqual([
      { type: "action", action: "pointer.click" },
    ]);
  });

  it("routes left-stick directions through the compact model picker", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 100),
    ).toEqual([
      { type: "action", action: "modelPower.open" },
    ]);
    expect(engine.modelPowerActive).toBe(false);
    engine.synchronizeModelPower(true);
    expect(engine.modelPowerActive).toBe(true);
    expect(
      engine.handle({ control: "left.stick.left", phase: "press" }, 200),
    ).toEqual([
      { type: "action", action: "modelPower.decrease" },
    ]);
    expect(
      engine.handle({ control: "left.stick.right", phase: "press" }, 300),
    ).toEqual([
      { type: "action", action: "modelPower.increase" },
    ]);
    expect(
      engine.handle({ control: "left.stick.up", phase: "press" }, 400),
    ).toEqual([
      { type: "action", action: "modelPower.fast" },
    ]);
    expect(
      engine.handle({ control: "left.stick.down", phase: "press" }, 500),
    ).toEqual([
      { type: "action", action: "modelPower.standard" },
    ]);
  });

  it("closes the model picker with L3 or Circle", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    engine.synchronizeModelPower(true);
    expect(
      engine.handle({ control: "left.stick.button", phase: "press" }, 200),
    ).toEqual([
      { type: "action", action: "modelPower.close" },
    ]);
    expect(engine.modelPowerActive).toBe(false);

    engine.handle({ control: "left.stick.button", phase: "press" }, 300);
    engine.synchronizeModelPower(true);
    expect(engine.handle({ control: "circle", phase: "press" }, 400)).toEqual([
      { type: "action", action: "modelPower.close" },
    ]);
    expect(engine.modelPowerActive).toBe(false);
  });

  it("does not repeat picker actions for physical button releases", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    engine.synchronizeModelPower(true);
    expect(
      engine.handle({ control: "left.stick.button", phase: "release" }, 150),
    ).toEqual([
      { type: "ignored", reason: "unbound" },
    ]);
    expect(
      engine.handle({ control: "left.stick.left", phase: "release" }, 200),
    ).toEqual([
      { type: "ignored", reason: "unbound" },
    ]);
    expect(engine.modelPowerActive).toBe(true);
  });

  it("closes the picker before dispatching another bound action", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    engine.synchronizeModelPower(true);
    expect(engine.handle({ control: "triangle", phase: "press" }, 200)).toEqual([
      { type: "action", action: "modelPower.close" },
      { type: "action", action: "clearInput" },
    ]);
    expect(engine.modelPowerActive).toBe(false);
  });

  it("forgets picker state without sending UI input when Codex loses focus", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    engine.synchronizeModelPower(true);
    expect(engine.synchronizeEnabled(false)).toEqual([
      { type: "state", enabled: false },
      { type: "action", action: "voice.cancel" },
    ]);
    expect(engine.modelPowerActive).toBe(false);
  });

  it("enters picker state only after successful UI verification", () => {
    const engine = new ControllerEngine({ ...config, startEnabled: true });

    engine.handle({ control: "left.stick.button", phase: "press" }, 100);
    expect(engine.modelPowerActive).toBe(false);
    engine.synchronizeModelPower(false);
    expect(
      engine.handle({ control: "left.stick.left", phase: "press" }, 200),
    ).toEqual([
      { type: "ignored", reason: "unbound" },
    ]);

    engine.synchronizeModelPower(true);
    expect(engine.modelPowerActive).toBe(true);
    engine.resetModelPower();
    expect(engine.modelPowerActive).toBe(false);
  });
});
