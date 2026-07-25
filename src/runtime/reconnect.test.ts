import { describe, expect, it, vi } from "vitest";
import { abortableDelay, ReconnectBackoff } from "./reconnect.js";

describe("ReconnectBackoff", () => {
  it("backs off to a cap and resets after a connection", () => {
    const backoff = new ReconnectBackoff({
      initialMs: 100,
      maximumMs: 350,
      factor: 2,
    });

    expect([
      backoff.next(),
      backoff.next(),
      backoff.next(),
      backoff.next(),
    ]).toEqual([100, 200, 350, 350]);
    backoff.reset();
    expect(backoff.next()).toBe(100);
  });

  it("ends a pending delay when shutdown is requested", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = abortableDelay(30_000, controller.signal);

    controller.abort();
    await pending;

    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
