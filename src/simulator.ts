#!/usr/bin/env node

import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { ConfigError, loadConfig } from "./core/config.js";
import { ControllerEngine } from "./core/engine.js";
import { parseInputLine } from "./core/simulator-input.js";

async function main(): Promise<void> {
  const configPath = resolve(process.argv[2] ?? "config.json");
  const config = await loadConfig(configPath);
  const engine = new ControllerEngine(config);
  const lines = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: process.stdin.isTTY,
  });

  process.stdout.write(
    `${JSON.stringify({
      type: "ready",
      enabled: engine.active,
      configPath,
      input: "<control> <press|release>",
    })}\n`,
  );

  for await (const line of lines) {
    if (line.trim() === "quit" || line.trim() === "exit") {
      break;
    }
    try {
      const event = parseInputLine(line);
      const outputs = engine.handle(event);
      for (const output of outputs) {
        process.stdout.write(`${JSON.stringify({ event, ...output })}\n`);
      }
      if (
        outputs.some(
          (output) =>
            output.type === "action"
            && output.action === "focusCodex",
        )
      ) {
        for (const output of engine.synchronizeEnabled(true)) {
          process.stdout.write(
            `${JSON.stringify({ event, simulated: "codex-frontmost", ...output })}\n`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
    }
  }

  for (const output of engine.disable()) {
    process.stdout.write(`${JSON.stringify({ type: "shutdown", output })}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError || error instanceof Error
    ? error.message
    : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
