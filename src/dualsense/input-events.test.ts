import { describe, expect, it } from "vitest";
import {
  DefaultDualsenseHIDState,
  InputId,
  type DualsenseHIDState,
} from "dualsense-ts";
import { diffButtonEvents } from "./input-events.js";

describe("diffButtonEvents", () => {
  it("normalizes button transitions", () => {
    const previous = { ...DefaultDualsenseHIDState };
    const current: DualsenseHIDState = {
      ...previous,
      [InputId.Options]: true,
      [InputId.RightTriggerButton]: true,
    };

    expect(diffButtonEvents(previous, current)).toEqual([
      { control: "options", phase: "press" },
      { control: "right.trigger.button", phase: "press" },
    ]);
  });

  it("does not emit unchanged buttons", () => {
    expect(
      diffButtonEvents(
        { ...DefaultDualsenseHIDState },
        { ...DefaultDualsenseHIDState },
      ),
    ).toEqual([]);
  });
});
