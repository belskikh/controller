import { describe, expect, it } from "vitest";
import {
  DefaultDualsenseHIDState,
  InputId,
  type DualsenseHIDState,
} from "dualsense-ts";
import { TouchpadPointerTracker } from "./touchpad-pointer.js";

function touch(
  overrides: Partial<DualsenseHIDState>,
): DualsenseHIDState {
  return {
    ...DefaultDualsenseHIDState,
    [InputId.TouchContact0]: true,
    [InputId.TouchId0]: 7,
    [InputId.TouchX0]: 0,
    [InputId.TouchY0]: 0,
    ...overrides,
  };
}

describe("TouchpadPointerTracker", () => {
  it("anchors a new contact before emitting relative movement", () => {
    const tracker = new TouchpadPointerTracker();

    expect(tracker.update(touch({}))).toBeUndefined();
    expect(
      tracker.update(
        touch({
          [InputId.TouchX0]: 0.01,
          [InputId.TouchY0]: 0.02,
        }),
      ),
    ).toEqual({
      dx: expect.closeTo(6.24, 5),
      dy: expect.closeTo(7.02, 5),
    });
  });

  it("re-anchors after contact ends or its tracking ID changes", () => {
    const tracker = new TouchpadPointerTracker();
    tracker.update(touch({}));

    expect(
      tracker.update({
        ...DefaultDualsenseHIDState,
        [InputId.TouchContact0]: false,
      }),
    ).toBeUndefined();
    expect(
      tracker.update(
        touch({
          [InputId.TouchId0]: 8,
          [InputId.TouchX0]: 0.4,
        }),
      ),
    ).toBeUndefined();
  });

  it("rejects discontinuities and caps a fast valid step", () => {
    const tracker = new TouchpadPointerTracker();
    tracker.update(touch({}));

    expect(
      tracker.update(touch({ [InputId.TouchX0]: 0.5 })),
    ).toBeUndefined();

    tracker.reset();
    tracker.update(touch({}));
    expect(
      tracker.update(touch({ [InputId.TouchX0]: 0.3 })),
    ).toEqual({ dx: 120, dy: 0 });
  });

  it("uses the second contact slot when it is the only active touch", () => {
    const tracker = new TouchpadPointerTracker();
    const first: DualsenseHIDState = {
      ...DefaultDualsenseHIDState,
      [InputId.TouchContact1]: true,
      [InputId.TouchId1]: 3,
      [InputId.TouchX1]: -0.2,
      [InputId.TouchY1]: 0.1,
    };
    const second = {
      ...first,
      [InputId.TouchX1]: -0.19,
    };

    expect(tracker.update(first)).toBeUndefined();
    expect(tracker.update(second)?.dx).toBeGreaterThan(0);
  });
});
