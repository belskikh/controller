import { readFile } from "node:fs/promises";
import { ACTIONS, type Action, type Binding, type ControllerConfig } from "./types.js";

const actionSet: ReadonlySet<string> = new Set(ACTIONS);

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export async function loadConfig(path: string): Promise<ControllerConfig> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Could not read config at ${path}: ${message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Config is not valid JSON: ${message}`);
  }

  return validateConfig(value);
}

export function validateConfig(value: unknown): ControllerConfig {
  const object = requireRecord(value, "config");
  if (object.version !== 1) {
    throw new ConfigError("config.version must be 1.");
  }
  if (typeof object.startEnabled !== "boolean") {
    throw new ConfigError("config.startEnabled must be a boolean.");
  }
  if (
    typeof object.debounceMs !== "number"
    || !Number.isInteger(object.debounceMs)
    || object.debounceMs < 0
    || object.debounceMs > 2_000
  ) {
    throw new ConfigError(
      "config.debounceMs must be an integer from 0 to 2000.",
    );
  }

  const rawBindings = requireRecord(object.bindings, "config.bindings");
  const bindings: Record<string, Binding> = {};
  let hasCodexActivator = false;

  for (const [control, rawBinding] of Object.entries(rawBindings)) {
    if (control.trim().length === 0) {
      throw new ConfigError("Binding control names cannot be empty.");
    }
    const bindingObject = requireRecord(
      rawBinding,
      `config.bindings.${control}`,
    );
    const binding: Binding = {};

    for (const phase of ["press", "release"] as const) {
      const rawAction = bindingObject[phase];
      if (rawAction === undefined) {
        continue;
      }
      if (typeof rawAction !== "string" || !actionSet.has(rawAction)) {
        throw new ConfigError(
          `Unknown action at config.bindings.${control}.${phase}: ${String(rawAction)}`,
        );
      }
      const action = rawAction as Action;
      binding[phase] = action;
      hasCodexActivator ||= action === "focusCodex";
    }

    const unknownKeys = Object.keys(bindingObject).filter(
      (key) => key !== "press" && key !== "release",
    );
    if (unknownKeys.length > 0) {
      throw new ConfigError(
        `Unknown binding field at ${control}: ${unknownKeys.join(", ")}`,
      );
    }
    if (binding.press === undefined && binding.release === undefined) {
      throw new ConfigError(`Binding for ${control} is empty.`);
    }

    bindings[control] = binding;
  }

  if (!hasCodexActivator) {
    throw new ConfigError(
      "At least one binding must map to focusCodex as the global activator.",
    );
  }

  return {
    version: 1,
    startEnabled: object.startEnabled,
    debounceMs: object.debounceMs,
    bindings,
  };
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
