export class ConnectionWatchdog {
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(
    private readonly timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("Watchdog timeout must be positive.");
    }
  }

  kick(): void {
    if (this.disposed) {
      return;
    }
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.disposed) {
        this.onTimeout();
      }
    }, this.timeoutMs);
    this.timer.unref();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
