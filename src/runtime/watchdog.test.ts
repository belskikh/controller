import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionWatchdog } from "./watchdog.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("ConnectionWatchdog", () => {
  it("fires after input reports stop", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new ConnectionWatchdog(1_000, onTimeout);

    watchdog.kick();
    vi.advanceTimersByTime(900);
    watchdog.kick();
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("does not fire after disposal", () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = new ConnectionWatchdog(1_000, onTimeout);

    watchdog.kick();
    watchdog.dispose();
    vi.advanceTimersByTime(1_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
