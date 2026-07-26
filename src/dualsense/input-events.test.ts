import { describe, expect, it } from "vitest";
import {
  DefaultDualsenseHIDState,
  InputId,
  type DualsenseHIDState,
} from "dualsense-ts";
import {
  diffButtonEvents,
  LeftStickDirectionTracker,
} from "./input-events.js";

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

  it("emits each left-stick direction once until the stick returns to centre", () => {
    const tracker = new LeftStickDirectionTracker();
    const state = (overrides: Partial<DualsenseHIDState>): DualsenseHIDState => ({
      ...DefaultDualsenseHIDState,
      ...overrides,
    });

    expect(tracker.update(state({ [InputId.LeftAnalogX]: -0.8 }))).toEqual({
      control: "left.stick.left",
      phase: "press",
    });
    expect(tracker.update(state({ [InputId.LeftAnalogX]: -1 }))).toBeUndefined();
    expect(tracker.update(state({ [InputId.LeftAnalogX]: 0 }))).toBeUndefined();
    expect(tracker.update(state({ [InputId.LeftAnalogX]: -0.8 }))).toEqual({
      control: "left.stick.left",
      phase: "press",
    });
  });

  it("uses the dominant left-stick axis and maps positive Y to up", () => {
    const tracker = new LeftStickDirectionTracker();
    const state = (overrides: Partial<DualsenseHIDState>): DualsenseHIDState => ({
      ...DefaultDualsenseHIDState,
      ...overrides,
    });

    expect(tracker.update(state({ [InputId.LeftAnalogY]: 0.8 }))).toEqual({
      control: "left.stick.up",
      phase: "press",
    });
    tracker.update(state({}));
    expect(tracker.update(state({ [InputId.LeftAnalogY]: -0.8 }))).toEqual({
      control: "left.stick.down",
      phase: "press",
    });
  });
});
