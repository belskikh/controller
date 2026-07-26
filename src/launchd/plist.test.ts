import { describe, expect, it } from "vitest";
import {
  LAUNCH_AGENT_LABEL,
  renderLaunchAgentPlist,
} from "./plist.js";

describe("renderLaunchAgentPlist", () => {
  it("uses absolute runtime paths and the enabled-by-default daemon", () => {
    const plist = renderLaunchAgentPlist({
      logDirectory: "/Users/test/Library/Logs/DualSense & Codex",
      nodePath: "/opt/homebrew/bin/node",
      projectDirectory: "/Users/test/Codex <Control>",
    });

    expect(plist).toContain(`<string>${LAUNCH_AGENT_LABEL}</string>`);
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain(
      "<string>/Users/test/Codex &lt;Control&gt;/dist/daemon.js</string>",
    );
    expect(plist).not.toContain("<string>--disable-actions</string>");
    expect(plist).not.toContain("<string>--disable-voice</string>");
    expect(plist).toContain("DualSense &amp; Codex/daemon.log");
  });
});
