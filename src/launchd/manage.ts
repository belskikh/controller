#!/usr/bin/env node

import { copyFile, mkdir } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { LAUNCH_AGENT_LABEL } from "./plist.js";

const run = promisify(execFile);

export type BackgroundCommand = "start" | "stop" | "status";

export function parseBackgroundCommand(
  args: readonly string[],
): BackgroundCommand {
  if (args.length !== 1 || !isBackgroundCommand(args[0])) {
    throw new Error("Usage: npm run daemon:background -- <start|stop|status>");
  }
  return args[0];
}

export function launchAgentDomain(uid: number): string {
  return `gui/${uid}`;
}

export function launchAgentDestination(homeDirectory = homedir()): string {
  return resolve(homeDirectory, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

async function main(): Promise<void> {
  const command = parseBackgroundCommand(process.argv.slice(2));
  const domain = launchAgentDomain(userInfo().uid);
  const destination = launchAgentDestination();

  if (command === "status") {
    await run("launchctl", ["print", `${domain}/${LAUNCH_AGENT_LABEL}`]);
    process.stdout.write("DualSense Codex background agent is running.\n");
    return;
  }

  if (command === "stop") {
    await bootout(domain, destination);
    process.stdout.write("DualSense Codex background agent stopped.\n");
    return;
  }

  const source = resolve(process.cwd(), "dist", `${LAUNCH_AGENT_LABEL}.plist`);
  await mkdir(resolve(homedir(), "Library", "LaunchAgents"), { recursive: true });
  await bootout(domain, destination);
  await copyFile(source, destination);
  await run("launchctl", ["bootstrap", domain, destination]);
  await run("launchctl", ["kickstart", "-k", `${domain}/${LAUNCH_AGENT_LABEL}`]);
  process.stdout.write("DualSense Codex background agent started.\n");
}

async function bootout(domain: string, destination: string): Promise<void> {
  try {
    await run("launchctl", ["bootout", domain, destination]);
  } catch {
    // It is safe for the agent not to have been loaded yet.
  }
}

function isBackgroundCommand(value: string | undefined): value is BackgroundCommand {
  return value === "start" || value === "stop" || value === "status";
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
