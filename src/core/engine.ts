import type {
  Action,
  ControllerConfig,
  EngineOutput,
  InputEvent,
} from "./types.js";

export class ControllerEngine {
  private enabled: boolean;
  private readonly lastEventAt = new Map<string, number>();

  constructor(private readonly config: ControllerConfig) {
    this.enabled = config.startEnabled;
  }

  get active(): boolean {
    return this.enabled;
  }

  handle(event: InputEvent, now = Date.now()): readonly EngineOutput[] {
    const binding = this.config.bindings[event.control];
    const action = binding?.[event.phase];
    if (action === undefined) {
      return [{ type: "ignored", reason: "unbound" }];
    }

    const debounceKey = `${event.control}:${event.phase}`;
    const previous = this.lastEventAt.get(debounceKey);
    if (
      previous !== undefined
      && now - previous >= 0
      && now - previous < this.config.debounceMs
    ) {
      return [{ type: "ignored", reason: "debounced" }];
    }
    this.lastEventAt.set(debounceKey, now);

    if (action === "focusCodex") {
      return this.dispatch(action);
    }
    if (!this.enabled) {
      return [{ type: "ignored", reason: "disabled" }];
    }

    return this.dispatch(action);
  }

  disable(): readonly EngineOutput[] {
    if (!this.enabled) {
      return [{ type: "state", enabled: false }];
    }
    this.enabled = false;
    return [
      { type: "state", enabled: false },
      { type: "action", action: "voice.cancel" },
    ];
  }

  synchronizeEnabled(enabled: boolean): readonly EngineOutput[] {
    if (enabled === this.enabled) {
      return [];
    }
    if (!enabled) {
      return this.disable();
    }
    this.enabled = true;
    return [{ type: "state", enabled }];
  }

  private dispatch(action: Action): readonly EngineOutput[] {
    return [{ type: "action", action }];
  }
}
