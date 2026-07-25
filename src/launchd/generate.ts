#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  LAUNCH_AGENT_LABEL,
  renderLaunchAgentPlist,
} from "./plist.js";

async function main(): Promise<void> {
  const projectDirectory = process.cwd();
  const outputPath = resolve(
    projectDirectory,
    "dist",
    `${LAUNCH_AGENT_LABEL}.plist`,
  );
  const logDirectory = resolve(
    homedir(),
    "Library",
    "Logs",
    "DualSenseCodex",
  );
  const nodePath = await stableNodePath();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    renderLaunchAgentPlist({
      logDirectory,
      nodePath,
      projectDirectory,
    }),
    "utf8",
  );
  process.stdout.write(`${outputPath}\n`);
}

async function stableNodePath(): Promise<string> {
  for (const candidate of [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next stable installation path.
    }
  }
  return process.execPath;
}

void main();
