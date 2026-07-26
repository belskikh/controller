import { describe, expect, it } from "vitest";
import { encodePointerCommand } from "./pointer-stream.js";

describe("encodePointerCommand", () => {
  it("encodes one line per move or click", () => {
    expect(
      encodePointerCommand({ type: "move", dx: 1.25, dy: -2.5 }),
    ).toBe('{"type":"move","dx":1.25,"dy":-2.5}\n');
    expect(encodePointerCommand({ type: "click" })).toBe(
      '{"type":"click"}\n',
    );
  });
});
