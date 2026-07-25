import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

export interface AttentionState {
  attentionCount: number;
  pid: number | null;
}

export class AttentionTracker {
  private previous: AttentionState | undefined;

  update(state: AttentionState): number {
    const previous = this.previous;
    this.previous = state;
    if (previous === undefined || previous.pid !== state.pid) {
      return 0;
    }
    return Math.max(0, state.attentionCount - previous.attentionCount);
  }
}

export class MacOSAttentionMonitor {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stopping = false;

  constructor(
    private readonly executablePath: string,
    private readonly targetBundleIdentifier: string,
  ) {}

  start(
    onState: (state: AttentionState) => void,
    onError: (error: Error) => void,
  ): void {
    if (this.child !== undefined) {
      throw new Error("Attention monitor is already running.");
    }
    this.stopping = false;
    const child = spawn(
      this.executablePath,
      [
        "watch-attention",
        "--bundle-id",
        this.targetBundleIdentifier,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdin.end();
    this.child = child;
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split("\n");
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0) {
          continue;
        }
        try {
          onState(parseAttentionState(line));
        } catch (error) {
          onError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", onError);
    child.on("close", (code, signal) => {
      this.child = undefined;
      if (!this.stopping) {
        onError(
          new Error(
            stderr.trim()
            || `Attention monitor exited with code ${String(code)} and signal ${String(signal)}.`,
          ),
        );
      }
    });
  }

  stop(): void {
    this.stopping = true;
    this.child?.kill("SIGTERM");
    this.child = undefined;
  }
}

export function parseAttentionState(source: string): AttentionState {
  const value = JSON.parse(source) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new Error("Attention monitor returned a non-object value.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.pid !== null
    && (
      typeof record.pid !== "number"
      || !Number.isInteger(record.pid)
      || record.pid <= 0
    )
  ) {
    throw new Error("Attention monitor returned an invalid PID.");
  }
  if (
    typeof record.attentionCount !== "number"
    || !Number.isInteger(record.attentionCount)
    || record.attentionCount < 0
  ) {
    throw new Error("Attention monitor returned an invalid count.");
  }
  return {
    attentionCount: record.attentionCount,
    pid: record.pid,
  };
}
