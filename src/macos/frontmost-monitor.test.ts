import { describe, expect, it } from "vitest";
import { parseFrontmostState } from "./frontmost-monitor.js";

describe("parseFrontmostState", () => {
  it("parses a native helper state line", () => {
    expect(
      parseFrontmostState(
        '{"bundleIdentifier":"com.openai.codex","targetFrontmost":true}',
      ),
    ).toEqual({
      bundleIdentifier: "com.openai.codex",
      targetFrontmost: true,
    });
  });

  it("rejects malformed helper output", () => {
    expect(() =>
      parseFrontmostState('{"targetFrontmost":"yes"}'),
    ).toThrow(/invalid/);
  });
});
