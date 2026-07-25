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
