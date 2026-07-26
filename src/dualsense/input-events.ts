import {
  type DualsenseHID,
  type DualsenseHIDState,
  InputId,
} from "dualsense-ts";
import type { InputEvent } from "../core/types.js";

type ButtonInputId =
  | InputId.Cross
  | InputId.Circle
  | InputId.Square
  | InputId.Triangle
  | InputId.Playstation
  | InputId.Mute
  | InputId.Options
  | InputId.Create
  | InputId.Up
  | InputId.Down
  | InputId.Left
  | InputId.Right
  | InputId.LeftBumper
  | InputId.RightBumper
  | InputId.LeftTriggerButton
  | InputId.RightTriggerButton
  | InputId.LeftAnalogButton
  | InputId.RightAnalogButton
  | InputId.TouchButton;

export const BUTTON_INPUTS: ReadonlyArray<
  readonly [control: string, inputId: ButtonInputId]
> = [
  ["cross", InputId.Cross],
  ["circle", InputId.Circle],
  ["square", InputId.Square],
  ["triangle", InputId.Triangle],
  ["ps", InputId.Playstation],
  ["mute", InputId.Mute],
  ["options", InputId.Options],
  ["create", InputId.Create],
  ["dpad.up", InputId.Up],
  ["dpad.down", InputId.Down],
  ["dpad.left", InputId.Left],
  ["dpad.right", InputId.Right],
  ["left.bumper", InputId.LeftBumper],
  ["right.bumper", InputId.RightBumper],
  ["left.trigger.button", InputId.LeftTriggerButton],
  ["right.trigger.button", InputId.RightTriggerButton],
  ["left.stick.button", InputId.LeftAnalogButton],
  ["right.stick.button", InputId.RightAnalogButton],
  ["touchpad.button", InputId.TouchButton],
];

export type LeftStickDirection = "left" | "right" | "up" | "down";

const LEFT_STICK_ENGAGE_THRESHOLD = 0.7;
const LEFT_STICK_RELEASE_THRESHOLD = 0.35;

/**
 * Converts a left-stick gesture into a single directional press. A direction
 * must return near the centre before that same gesture can fire again.
 */
export class LeftStickDirectionTracker {
  private activeDirection: LeftStickDirection | undefined;

  update(state: DualsenseHIDState): InputEvent | undefined {
    const x = state[InputId.LeftAnalogX];
    const y = state[InputId.LeftAnalogY];
    const magnitude = Math.hypot(x, y);
    if (magnitude < LEFT_STICK_RELEASE_THRESHOLD) {
      this.activeDirection = undefined;
      return undefined;
    }
    if (magnitude < LEFT_STICK_ENGAGE_THRESHOLD) {
      return undefined;
    }

    const direction = Math.abs(x) >= Math.abs(y)
      ? x < 0 ? "left" : "right"
      : y < 0 ? "down" : "up";
    if (direction === this.activeDirection) {
      return undefined;
    }
    this.activeDirection = direction;
    return { control: `left.stick.${direction}`, phase: "press" };
  }

  reset(): void {
    this.activeDirection = undefined;
  }
}

export function diffButtonEvents(
  previous: DualsenseHIDState,
  current: DualsenseHIDState,
): readonly InputEvent[] {
  const events: InputEvent[] = [];
  for (const [control, inputId] of BUTTON_INPUTS) {
    if (current[inputId] !== previous[inputId]) {
      events.push({
        control,
        phase: current[inputId] ? "press" : "release",
      });
    }
  }
  return events;
}

export function subscribeButtonEvents(
  hid: DualsenseHID,
  listener: (event: InputEvent) => void,
): () => void {
  let previous = { ...hid.state };
  const handleState = (current: DualsenseHIDState): void => {
    for (const event of diffButtonEvents(previous, current)) {
      listener(event);
    }
    previous = { ...current };
  };
  hid.register(handleState);
  return () => hid.unregister(handleState);
}

export function subscribeLeftStickDirections(
  hid: DualsenseHID,
  listener: (event: InputEvent) => void,
): () => void {
  const tracker = new LeftStickDirectionTracker();
  const handleState = (state: DualsenseHIDState): void => {
    const event = tracker.update(state);
    if (event !== undefined) {
      listener(event);
    }
  };
  hid.register(handleState);
  return () => {
    tracker.reset();
    hid.unregister(handleState);
  };
}
