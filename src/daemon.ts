#!/usr/bin/env node

import { loadConfig } from "./core/config.js";
import { ControllerEngine } from "./core/engine.js";
import type {
  ControllerConfig,
  EngineOutput,
  InputEvent,
} from "./core/types.js";
import {
  connectBluetoothHID,
  disconnectHID,
  type BluetoothHIDConnection,
} from "./dualsense/bluetooth.js";
import { subscribeButtonEvents } from "./dualsense/input-events.js";
import { BluetoothDualSenseOutput } from "./dualsense/output.js";
import { DualSenseFeedbackPolicy } from "./dualsense/feedback.js";
import {
  CODEX_BUNDLE_IDENTIFIER,
  CodexAccessibilityAdapter,
  CodexAccessibilityError,
} from "./adapters/codex-accessibility.js";
import { CodexVoiceAccessibilityAdapter } from "./adapters/codex-voice-accessibility.js";
import { MacOSControlClient } from "./macos/control-client.js";
import { MacOSFrontmostMonitor } from "./macos/frontmost-monitor.js";
import {
  DaemonOptionsError,
  parseDaemonOptions,
} from "./daemon-options.js";
import {
  abortableDelay,
  ReconnectBackoff,
} from "./runtime/reconnect.js";
import { ConnectionWatchdog } from "./runtime/watchdog.js";

const HID_WATCHDOG_TIMEOUT_MS = 5_000;

type SessionEndReason =
  | "disconnected"
  | "hid-error"
  | "signal"
  | "watchdog";

async function main(): Promise<void> {
  const options = parseDaemonOptions(process.argv.slice(2));
  const config = await loadConfig(options.configPath);
  const engine = new ControllerEngine(config);
  const controlClient = new MacOSControlClient(options.macOSHelperPath);
  const codex = new CodexAccessibilityAdapter(
    controlClient,
    options.enableActions,
  );
  const voice = new CodexVoiceAccessibilityAdapter(
    controlClient,
    options.enableVoice,
  );
  const shutdown = new AbortController();
  const requestShutdown = (): void => shutdown.abort();
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);
  const reconnectBackoff = new ReconnectBackoff();

  try {
    while (!shutdown.signal.aborted) {
      let connection: BluetoothHIDConnection;
      try {
        connection = await connectBluetoothHID();
      } catch (error) {
        if (shutdown.signal.aborted) {
          break;
        }
        emitError(error);
        await waitToReconnect(reconnectBackoff, shutdown.signal);
        continue;
      }

      reconnectBackoff.reset();
      let reason: SessionEndReason;
      try {
        reason = await runConnectedSession(
          connection,
          config,
          engine,
          codex,
          voice,
          options,
          shutdown.signal,
        );
      } catch (error) {
        emitError(error);
        reason = "hid-error";
      }
      if (reason === "signal" || shutdown.signal.aborted) {
        emit("shutdown-requested", { reason: "signal" });
        break;
      }
      emit("connection-ended", { reason });
      await waitToReconnect(reconnectBackoff, shutdown.signal);
    }
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    engine.disable();
    if (options.enableVoice) {
      await voice.cancel().catch(() => {});
    }
    emit("stopped", {});
  }
}

async function runConnectedSession(
  connection: BluetoothHIDConnection,
  config: ControllerConfig,
  engine: ControllerEngine,
  codex: CodexAccessibilityAdapter,
  voice: CodexVoiceAccessibilityAdapter,
  options: ReturnType<typeof parseDaemonOptions>,
  signal: AbortSignal,
): Promise<SessionEndReason> {
  const feedback = new DualSenseFeedbackPolicy(
    new BluetoothDualSenseOutput(connection.provider),
    (milliseconds) => new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
  );
  let work = Promise.resolve();
  let acceptingInput = true;
  let unsubscribeInput = (): void => {};
  const frontmostMonitor = new MacOSFrontmostMonitor(
    options.macOSHelperPath,
    CODEX_BUNDLE_IDENTIFIER,
  );

  const applyAvailability = async (codexFrontmost: boolean): Promise<void> => {
    for (const output of engine.synchronizeEnabled(codexFrontmost)) {
      await handleEngineOutput(
        output,
        codex,
        voice,
        feedback,
        options.enableVoice,
      );
    }
  };
  const synchronizeAvailability = async (): Promise<void> => {
    await applyAvailability(await codex.isFrontmost());
  };
  const enqueueAvailability = (codexFrontmost: boolean): void => {
    if (!acceptingInput) {
      return;
    }
    work = work
      .then(async () => {
        if (acceptingInput) {
          await applyAvailability(codexFrontmost);
        }
      })
      .catch(async (error: unknown) => {
        emitError(error);
        await feedback.showError().catch(() => {});
      });
  };

  const enqueueEvent = (event: InputEvent): void => {
    if (!acceptingInput) {
      return;
    }
    work = work
      .then(async () => {
        if (!acceptingInput) {
          return;
        }
        emit("input", event);
        const action = config.bindings[event.control]?.[event.phase];
        if (action !== "focusCodex") {
          await synchronizeAvailability();
        }
        for (const output of engine.handle(event)) {
          await handleEngineOutput(
            output,
            codex,
            voice,
            feedback,
            options.enableVoice,
          );
        }
        if (action === "focusCodex") {
          await synchronizeAvailability();
        }
      })
      .catch(async (error: unknown) => {
        emitError(error);
        await feedback.showError().catch(() => {});
      });
  };

  try {
    await feedback.initialize();
    await synchronizeAvailability();
    frontmostMonitor.start(
      (state) => enqueueAvailability(state.targetFrontmost),
      (error) => {
        emitError(error);
        enqueueAvailability(false);
      },
    );
    unsubscribeInput = subscribeButtonEvents(connection.hid, enqueueEvent);
    emit("ready", {
      actionsEnabled: options.enableActions,
      configPath: options.configPath,
      devicePath: connection.device.path,
      transport: "bluetooth",
      voiceEnabled: options.enableVoice,
    });
    return await waitForSessionEnd(connection, signal);
  } finally {
    acceptingInput = false;
    frontmostMonitor.stop();
    unsubscribeInput();
    await work.catch(() => {});
    engine.disable();
    if (options.enableVoice) {
      await voice.cancel().catch(() => {});
    }
    await feedback.shutdown().catch(() => {});
    disconnectHID(connection);
  }
}

async function waitToReconnect(
  backoff: ReconnectBackoff,
  signal: AbortSignal,
): Promise<void> {
  const delayMs = backoff.next();
  emit("reconnecting", { delayMs });
  await abortableDelay(delayMs, signal);
}

async function handleEngineOutput(
  output: EngineOutput,
  codex: CodexAccessibilityAdapter,
  voice: CodexVoiceAccessibilityAdapter,
  feedback: DualSenseFeedbackPolicy,
  voiceEnabled: boolean,
): Promise<void> {
  if (output.type === "ignored") {
    emit("ignored", { reason: output.reason });
    return;
  }
  if (output.type === "state") {
    await feedback.setEnabled(output.enabled);
    emit("enabled", { value: output.enabled });
    return;
  }

  emit("action", { action: output.action, phase: "started" });
  switch (output.action) {
    case "accept":
      await codex.accept();
      break;
    case "allowSimilarCommands":
      await codex.allowSimilarCommands();
      break;
    case "decline":
      await codex.decline();
      break;
    case "focusCodex":
      await codex.focus();
      break;
    case "interrupt":
      await codex.interrupt();
      break;
    case "newThread":
      await codex.newThread();
      break;
    case "toggleLastTask":
      await codex.toggleLastTask();
      break;
    case "switchPrevious":
      await codex.switchSession(-1);
      break;
    case "switchNext":
      await codex.switchSession(1);
      break;
    case "voice.toggle":
      if (voiceEnabled) {
        await voice.toggle();
      }
      break;
    case "voice.cancel":
      if (voiceEnabled) {
        await voice.cancel();
      }
      break;
  }
  emit("action", { action: output.action, phase: "completed" });
}

function waitForSessionEnd(
  connection: BluetoothHIDConnection,
  signal: AbortSignal,
): Promise<SessionEndReason> {
  return new Promise((resolve) => {
    let settled = false;
    let watchdog: ConnectionWatchdog | undefined;
    const onReport = (): void => watchdog?.kick();
    const onAbort = (): void => finish("signal");
    const finish = (reason: SessionEndReason): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      unsubscribeConnection();
      connection.hid.unregister(onReport);
      watchdog?.dispose();
      resolve(reason);
    };
    const unsubscribeConnection = connection.hid.onConnectionChange((connected) => {
      if (!connected) {
        finish("disconnected");
      }
    });
    connection.hid.on("error", () => finish("hid-error"));
    connection.hid.register(onReport);
    watchdog = new ConnectionWatchdog(
      HID_WATCHDOG_TIMEOUT_MS,
      () => finish("watchdog"),
    );
    watchdog.kick();
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      finish("signal");
    }
  });
}

function emit(type: string, details: object): void {
  process.stdout.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type,
      ...details,
    })}\n`,
  );
}

function emitError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const category = error instanceof CodexAccessibilityError
    ? "codex-accessibility"
    : "runtime";
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: "error",
      category,
      message,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof DaemonOptionsError) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  emitError(error);
  process.exitCode = 1;
});
