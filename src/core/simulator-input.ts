import type { InputEvent, InputPhase } from "./types.js";

export function parseInputLine(line: string): InputEvent {
  const [control, phase, ...rest] = line.trim().split(/\s+/u);
  if (
    control === undefined
    || control.length === 0
    || (phase !== "press" && phase !== "release")
    || rest.length > 0
  ) {
    throw new Error("Expected: <control> <press|release>");
  }
  return { control, phase: phase as InputPhase };
}
