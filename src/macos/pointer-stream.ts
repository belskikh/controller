import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

export interface PointerMoveCommand {
  type: "move";
  dx: number;
  dy: number;
}

export interface PointerClickCommand {
  type: "click";
}

export type PointerCommand = PointerMoveCommand | PointerClickCommand;

export class MacOSPointerStream {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stopping = false;
  private backpressured = false;
  private failureReported = false;
  private onError: ((error: Error) => void) | undefined;

  constructor(
    private readonly executablePath: string,
    private readonly targetBundleIdentifier: string,
  ) {}

  start(onError: (error: Error) => void): void {
    if (this.child !== undefined) {
      throw new Error("Pointer stream is already running.");
    }
    this.stopping = false;
    this.backpressured = false;
    this.failureReported = false;
    this.onError = onError;

    const child = spawn(
      this.executablePath,
      [
        "pointer-stream",
        "--bundle-id",
        this.targetBundleIdentifier,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    this.child = child;
    let stderr = "";

    child.stdout.resume();
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdin.on("drain", () => {
      this.backpressured = false;
    });
    child.stdin.on("error", (error) => {
      if (this.child === child) {
        this.reportFailure(error);
      }
    });
    child.on("error", (error) => {
      if (this.child === child) {
        this.reportFailure(error);
      }
    });
    child.on("close", (code, signal) => {
      const wasCurrent = this.child === child;
      if (wasCurrent) {
        this.child = undefined;
      }
      if (!this.stopping && wasCurrent) {
        this.reportFailure(
          new Error(
            stderr.trim()
            || `Pointer stream exited with code ${String(code)} and signal ${String(signal)}.`,
          ),
        );
      }
    });
  }

  move(dx: number, dy: number): void {
    if (this.backpressured) {
      return;
    }
    const child = this.child;
    if (child === undefined || child.stdin.destroyed) {
      return;
    }
    this.backpressured = !child.stdin.write(
      encodePointerCommand({ type: "move", dx, dy }),
    );
  }

  async click(): Promise<void> {
    const child = this.child;
    if (child === undefined || child.stdin.destroyed) {
      throw new Error("Pointer stream is not running.");
    }
    await new Promise<void>((resolve, reject) => {
      child.stdin.write(
        encodePointerCommand({ type: "click" }),
        (error) => {
          if (error === null || error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        },
      );
    });
  }

  stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = undefined;
    if (child !== undefined) {
      child.stdin.destroy();
      child.kill("SIGTERM");
    }
    this.backpressured = false;
    this.onError = undefined;
  }

  private reportFailure(error: Error): void {
    if (this.stopping || this.failureReported) {
      return;
    }
    this.failureReported = true;
    this.onError?.(error);
  }
}

export function encodePointerCommand(command: PointerCommand): string {
  return `${JSON.stringify(command)}\n`;
}
