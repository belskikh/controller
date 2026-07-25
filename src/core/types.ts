export const ACTIONS = [
  "accept",
  "allowSimilarCommands",
  "clearInput",
  "decline",
  "focusCodex",
  "interrupt",
  "newThread",
  "toggleLastTask",
  "switchPrevious",
  "switchNext",
  "voice.toggle",
  "voice.cancel",
] as const;

export type Action = (typeof ACTIONS)[number];
export type InputPhase = "press" | "release";

export interface InputEvent {
  control: string;
  phase: InputPhase;
}

export interface Binding {
  press?: Action;
  release?: Action;
}

export interface ControllerConfig {
  version: 1;
  startEnabled: boolean;
  debounceMs: number;
  bindings: Readonly<Record<string, Binding>>;
}

export type EngineOutput =
  | { type: "action"; action: Action }
  | { type: "state"; enabled: boolean }
  | { type: "ignored"; reason: "disabled" | "debounced" | "unbound" };
