import type {
  Action,
  ControllerConfig,
  EngineOutput,
  InputEvent,
} from "./types.js";

export class ControllerEngine {
  private enabled: boolean;
  private modelPowerOpen = false;
  private readonly lastEventAt = new Map<string, number>();

  constructor(private readonly config: ControllerConfig) {
    this.enabled = config.startEnabled;
  }

  get active(): boolean {
    return this.enabled;
  }

  get modelPowerActive(): boolean {
    return this.modelPowerOpen;
  }

  handle(event: InputEvent, now = Date.now()): readonly EngineOutput[] {
    const binding = this.config.bindings[event.control];
    const action = binding?.[event.phase];
    if (
      action === undefined
      && !(
        this.modelPowerOpen
        && event.phase === "press"
        && isModelPowerControl(event.control)
      )
    ) {
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

    if (this.modelPowerOpen && event.phase === "press") {
      return this.handleModelPowerInput(event.control, action);
    }
    if (action === undefined) {
      return [{ type: "ignored", reason: "unbound" }];
    }
    if (action === "focusCodex") {
      return this.dispatch(action);
    }
    if (!this.enabled) {
      return [{ type: "ignored", reason: "disabled" }];
    }

    if (action === "modelPower.toggle" || action === "modelPower.open") {
      return this.dispatch("modelPower.open");
    }
    if (action === "modelPower.close") {
      this.modelPowerOpen = false;
    }
    return this.dispatch(action);
  }

  disable(): readonly EngineOutput[] {
    this.modelPowerOpen = false;
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

  resetModelPower(): void {
    this.modelPowerOpen = false;
  }

  synchronizeModelPower(open: boolean): void {
    this.modelPowerOpen = open && this.enabled;
  }

  private handleModelPowerInput(
    control: string,
    action: Action | undefined,
  ): readonly EngineOutput[] {
    switch (control) {
      case "left.stick.left":
        return this.dispatch("modelPower.decrease");
      case "left.stick.right":
        return this.dispatch("modelPower.increase");
      case "left.stick.up":
        return this.dispatch("modelPower.fast");
      case "left.stick.down":
        return this.dispatch("modelPower.standard");
      case "left.stick.button":
      case "circle":
        this.modelPowerOpen = false;
        return this.dispatch("modelPower.close");
    }

    if (action === "modelPower.toggle" || action === "modelPower.close") {
      this.modelPowerOpen = false;
      return this.dispatch("modelPower.close");
    }
    if (action === "modelPower.open") {
      return [];
    }
    if (action === undefined) {
      return [{ type: "ignored", reason: "unbound" }];
    }

    this.modelPowerOpen = false;
    return [
      { type: "action", action: "modelPower.close" },
      { type: "action", action },
    ];
  }

  private dispatch(action: Action): readonly EngineOutput[] {
    return [{ type: "action", action }];
  }
}

function isModelPowerControl(control: string): boolean {
  return control === "left.stick.button"
    || control === "circle"
    || control === "left.stick.left"
    || control === "left.stick.right"
    || control === "left.stick.up"
    || control === "left.stick.down";
}
