export const LAUNCH_AGENT_LABEL = "com.codex.dualsense-control";

export interface LaunchAgentOptions {
  logDirectory: string;
  nodePath: string;
  projectDirectory: string;
}

export function renderLaunchAgentPlist(
  options: LaunchAgentOptions,
): string {
  const project = xml(options.projectDirectory);
  const node = xml(options.nodePath);
  const logDirectory = xml(options.logDirectory);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${project}/dist/daemon.js</string>
    <string>--enable-actions</string>
    <string>--enable-voice</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${project}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${logDirectory}/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>${logDirectory}/daemon.error.log</string>
</dict>
</plist>
`;
}

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
