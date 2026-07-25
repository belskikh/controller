import { describe, expect, it } from "vitest";
import { parseInputLine } from "./core/simulator-input.js";

describe("parseInputLine", () => {
  it("parses a controller event", () => {
    expect(parseInputLine("right.trigger.button press")).toEqual({
      control: "right.trigger.button",
      phase: "press",
    });
  });

  it("rejects malformed input", () => {
    expect(() => parseInputLine("cross tap")).toThrow(/Expected/);
  });
});
