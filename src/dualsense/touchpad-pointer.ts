import {
  type DualsenseHID,
  type DualsenseHIDState,
  InputId,
} from "dualsense-ts";

const TOUCHPAD_HALF_WIDTH = 960;
const TOUCHPAD_HALF_HEIGHT = 540;
const POINTER_SENSITIVITY = 0.65;
const MAX_NORMALIZED_STEP = 0.35;
const MAX_POINTER_STEP = 120;

export interface PointerDelta {
  dx: number;
  dy: number;
}

interface TouchContact {
  id: number;
  slot: 0 | 1;
  x: number;
  y: number;
}

export class TouchpadPointerTracker {
  private previous: TouchContact | undefined;

  update(state: DualsenseHIDState): PointerDelta | undefined {
    const contact = this.activeContact(state);
    const previous = this.previous;
    this.previous = contact;

    if (
      contact === undefined
      || previous === undefined
      || contact.slot !== previous.slot
      || contact.id !== previous.id
    ) {
      return undefined;
    }

    const normalizedDx = contact.x - previous.x;
    const normalizedDy = contact.y - previous.y;
    if (
      Math.abs(normalizedDx) > MAX_NORMALIZED_STEP
      || Math.abs(normalizedDy) > MAX_NORMALIZED_STEP
    ) {
      return undefined;
    }

    const rawDx = normalizedDx * TOUCHPAD_HALF_WIDTH;
    const rawDy = normalizedDy * TOUCHPAD_HALF_HEIGHT;
    const distance = Math.hypot(rawDx, rawDy);
    if (distance < 0.1) {
      return undefined;
    }

    return {
      dx: clamp(
        rawDx * POINTER_SENSITIVITY,
        -MAX_POINTER_STEP,
        MAX_POINTER_STEP,
      ),
      dy: clamp(
        rawDy * POINTER_SENSITIVITY,
        -MAX_POINTER_STEP,
        MAX_POINTER_STEP,
      ),
    };
  }

  reset(): void {
    this.previous = undefined;
  }

  private activeContact(
    state: DualsenseHIDState,
  ): TouchContact | undefined {
    if (state[InputId.TouchContact0]) {
      return {
        id: state[InputId.TouchId0],
        slot: 0,
        x: state[InputId.TouchX0],
        y: state[InputId.TouchY0],
      };
    }
    if (state[InputId.TouchContact1]) {
      return {
        id: state[InputId.TouchId1],
        slot: 1,
        x: state[InputId.TouchX1],
        y: state[InputId.TouchY1],
      };
    }
    return undefined;
  }
}

export function subscribeTouchpadPointer(
  hid: DualsenseHID,
  listener: (delta: PointerDelta) => void,
): () => void {
  const tracker = new TouchpadPointerTracker();
  const handleState = (state: DualsenseHIDState): void => {
    const delta = tracker.update(state);
    if (delta !== undefined) {
      listener(delta);
    }
  };
  hid.register(handleState);
  return () => {
    tracker.reset();
    hid.unregister(handleState);
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
