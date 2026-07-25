import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

export interface FrontmostState {
  bundleIdentifier: string | null;
  targetFrontmost: boolean;
}

export class MacOSFrontmostMonitor {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stopping = false;

  constructor(
    private readonly executablePath: string,
    private readonly targetBundleIdentifier: string,
  ) {}

  start(
    onState: (state: FrontmostState) => void,
    onError: (error: Error) => void,
  ): void {
    if (this.child !== undefined) {
      throw new Error("Frontmost monitor is already running.");
    }
    this.stopping = false;
    const child = spawn(
      this.executablePath,
      [
        "watch-frontmost",
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
          onState(parseFrontmostState(line));
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
            || `Frontmost monitor exited with code ${String(code)} and signal ${String(signal)}.`,
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

export function parseFrontmostState(source: string): FrontmostState {
  const value = JSON.parse(source) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new Error("Frontmost monitor returned a non-object value.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.bundleIdentifier !== null
    && typeof record.bundleIdentifier !== "string"
  ) {
    throw new Error("Frontmost monitor returned an invalid bundle ID.");
  }
  if (typeof record.targetFrontmost !== "boolean") {
    throw new Error("Frontmost monitor returned an invalid state.");
  }
  return {
    bundleIdentifier: record.bundleIdentifier,
    targetFrontmost: record.targetFrontmost,
  };
}
