import { describe, expect, it } from "vitest";
import { ConfigError, validateConfig } from "./config.js";

describe("validateConfig", () => {
  const valid = {
    version: 1,
    startEnabled: false,
    debounceMs: 80,
    bindings: {
      circle: { press: "focusCodex" },
      "left.stick.button": { press: "modelPower.toggle" },
      triangle: { press: "clearInput" },
    },
  };

  it("accepts a valid config", () => {
    expect(validateConfig(valid)).toEqual(valid);
  });

  it("rejects unknown actions", () => {
    expect(() =>
      validateConfig({
        ...valid,
        bindings: { circle: { press: "launchMissiles" } },
      }),
    ).toThrow(ConfigError);
  });

  it("requires a global Codex activator", () => {
    expect(() =>
      validateConfig({
        ...valid,
        bindings: { cross: { press: "accept" } },
      }),
    ).toThrow(/global activator/);
  });
});
