import { describe, expect, it } from "vitest";
import {
  DaemonOptionsError,
  parseDaemonOptions,
} from "./daemon-options.js";

describe("parseDaemonOptions", () => {
  it("defaults both controller capabilities to enabled", () => {
    expect(parseDaemonOptions([], "/project")).toEqual({
      configPath: "/project/config.json",
      enableActions: true,
      enableVoice: true,
      macOSHelperPath:
        "/project/helpers/macos-control/bin/macos-control",
    });
  });

  it("disables actions and voice independently", () => {
    expect(
      parseDaemonOptions(
        ["--disable-actions", "--disable-voice"],
        "/project",
      ),
    ).toMatchObject({
      enableActions: false,
      enableVoice: false,
    });
  });

  it("rejects unknown options", () => {
    expect(() => parseDaemonOptions(["--live"], "/project")).toThrow(
      DaemonOptionsError,
    );
  });
});
