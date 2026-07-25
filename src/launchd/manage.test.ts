import { describe, expect, it } from "vitest";
import {
  launchAgentDestination,
  launchAgentDomain,
  parseBackgroundCommand,
} from "./manage.js";

describe("background launch agent commands", () => {
  it("accepts the supported lifecycle commands", () => {
    expect(parseBackgroundCommand(["start"])).toBe("start");
    expect(parseBackgroundCommand(["stop"])).toBe("stop");
    expect(parseBackgroundCommand(["status"])).toBe("status");
  });

  it("rejects missing and unknown lifecycle commands", () => {
    expect(() => parseBackgroundCommand([])).toThrow("Usage:");
    expect(() => parseBackgroundCommand(["restart"])).toThrow("Usage:");
  });

  it("uses the current user's launchd domain and LaunchAgents directory", () => {
    expect(launchAgentDomain(501)).toBe("gui/501");
    expect(launchAgentDestination("/Users/test")).toBe(
      "/Users/test/Library/LaunchAgents/com.codex.dualsense-control.plist",
    );
  });
});
