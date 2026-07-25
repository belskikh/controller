export interface ReconnectBackoffOptions {
  factor?: number;
  initialMs?: number;
  maximumMs?: number;
}

export class ReconnectBackoff {
  private readonly factor: number;
  private readonly initialMs: number;
  private readonly maximumMs: number;
  private currentMs: number;

  constructor(options: ReconnectBackoffOptions = {}) {
    this.initialMs = options.initialMs ?? 1_000;
    this.maximumMs = options.maximumMs ?? 30_000;
    this.factor = options.factor ?? 2;
    if (
      this.initialMs <= 0
      || this.maximumMs < this.initialMs
      || this.factor < 1
    ) {
      throw new RangeError("Invalid reconnect backoff options.");
    }
    this.currentMs = this.initialMs;
  }

  next(): number {
    const result = this.currentMs;
    this.currentMs = Math.min(
      this.maximumMs,
      Math.ceil(this.currentMs * this.factor),
    );
    return result;
  }

  reset(): void {
    this.currentMs = this.initialMs;
  }
}

export function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
