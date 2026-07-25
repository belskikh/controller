import { describe, expect, it } from "vitest";
import {
  AttentionTracker,
  parseAttentionState,
} from "./attention-monitor.js";

describe("parseAttentionState", () => {
  it("parses a native helper state line", () => {
    expect(
      parseAttentionState('{"attentionCount":2,"pid":123}'),
    ).toEqual({
      attentionCount: 2,
      pid: 123,
    });
  });

  it("rejects malformed helper output", () => {
    expect(() =>
      parseAttentionState('{"attentionCount":-1,"pid":123}'),
    ).toThrow(/invalid count/);
  });
});

describe("AttentionTracker", () => {
  it("uses the initial state as a silent baseline", () => {
    const tracker = new AttentionTracker();

    expect(tracker.update({ attentionCount: 3, pid: 123 })).toBe(0);
  });

  it("reports only newly added attention items", () => {
    const tracker = new AttentionTracker();
    tracker.update({ attentionCount: 1, pid: 123 });

    expect(tracker.update({ attentionCount: 3, pid: 123 })).toBe(2);
    expect(tracker.update({ attentionCount: 2, pid: 123 })).toBe(0);
    expect(tracker.update({ attentionCount: 2, pid: 123 })).toBe(0);
  });

  it("resets its baseline after Codex relaunches", () => {
    const tracker = new AttentionTracker();
    tracker.update({ attentionCount: 0, pid: 123 });

    expect(tracker.update({ attentionCount: 2, pid: 456 })).toBe(0);
    expect(tracker.update({ attentionCount: 3, pid: 456 })).toBe(1);
  });
});
