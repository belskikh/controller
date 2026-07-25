import { describe, expect, it } from "vitest";
import {
  DaemonOptionsError,
  parseDaemonOptions,
} from "./daemon-options.js";

describe("parseDaemonOptions", () => {
  it("defaults both mutation boundaries to disabled", () => {
    expect(parseDaemonOptions([], "/project")).toEqual({
      configPath: "/project/config.json",
      enableActions: false,
      enableVoice: false,
      macOSHelperPath:
        "/project/helpers/macos-control/bin/macos-control",
    });
  });

  it("enables actions and voice independently", () => {
    expect(
      parseDaemonOptions(
        ["--enable-actions", "--enable-voice"],
        "/project",
      ),
    ).toMatchObject({
      enableActions: true,
      enableVoice: true,
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseDaemonOptions(["--live"], "/project")).toThrow(
      DaemonOptionsError,
    );
  });
});
