# DualSense Agent Control: validated implementation plan

## Constraints confirmed locally

- The transport is Bluetooth-only. USB is not a fallback.
- Codex Desktop owns its bundled `codex app-server` process over stdio.
- `~/.codex/ipc/ipc.sock` is an application-shell IPC endpoint, not an
  app-server JSON-RPC socket.
- A second app-server client is not a reliable owner of approval requests.
- Therefore the first Codex Desktop adapter must use macOS Accessibility.
- A protocol adapter remains useful only in a separate mode where this daemon
  starts and owns the app-server thread.

## Architecture

```text
Bluetooth DualSense
        |
        v
normalized input -> safety engine -> Codex Accessibility adapter
                         |                    |
                         |                    +-> approvals and navigation
                         |                    +-> native Codex dictation
                         v
                   feedback policy -> Bluetooth HID output
```

The safety engine starts locked. Outside Codex, only `Circle` is honored; it
activates Codex. The daemon checks the frontmost bundle before every other
controller action and unlocks only while Codex is frontmost. Locking also
cancels active dictation.

## Milestones and gates

### M0 — Bluetooth hardware gate

1. Enumerate DualSense devices and reject USB transports.
2. Read buttons and triggers for at least 30 seconds without output reports.
3. With explicit confirmation, set the lightbar/player LEDs and run a short,
   low-intensity rumble.
4. Verify output reset and clean disconnect after normal exit and `SIGINT`.

No daemon or app adapter is considered deployable until all four checks pass
on the actual paired controller.

### M1 — Safe core

1. Validate the versioned mapping file.
2. Normalize physical input to press/release events.
3. Debounce duplicate HID events.
4. Enforce a frontmost-Codex gate with `Circle` as the global activator.
5. Test routing decisions in a simulator that cannot control applications.

### M2 — macOS control boundary

1. Build a small signed-capable native helper (Objective-C is used because the
   locally selected Swift compiler and macOS SDK builds are incompatible).
2. Report Accessibility trust and frontmost application identity.
3. Support explicit key press/hold/release with guaranteed key-up cleanup.
4. Add narrow Accessibility queries/actions for visible Codex controls.
5. Refuse ambiguous matches. For Electron controls where `AXPress` reports
   success but does nothing, derive a click point from the single matched
   element's live AX frame; never use hard-coded screen coordinates.

### M3 — Codex Desktop adapter

1. Detect Codex as the frontmost app.
2. Inspect the focused window for visible approval controls.
3. Map `Allow once`, `Allow similar commands`, and `Deny` only when a matching
   control exists.
4. Map interrupt and task navigation through verified UI actions or
   known shortcuts.
5. Add a dry-run trace showing the intended target before enabling mutations.

Validated on the paired Bluetooth controller:

- `R2` clicked the exact `Allow once` button and completed a harmless command.
- `L2` clicked the exact `Deny` button and rejected a harmless command.
- `R1` opened `Approval options`, clicked the exact
  `Allow similar commands` menu item, and completed a harmless command.
- `Square` clicked the exact `Stop` control and interrupted a running Codex
  operation.
- `D-pad up` and `D-pad down` navigate visually up and down through Codex task
  history. This path remains separate from the L1 quick-toggle state.
- `L1` alternates Codex's verified Previous Chat and Next Chat commands,
  providing a two-task quick toggle. D-pad navigation resets the next L1 press
  to Previous Chat.
- Electron's reported `AXPress` success is not sufficient for these custom
  controls. Both the approval buttons and the popup menu item require a
  mouse click derived from the unique enabled element's live AX frame.

### M4 — native Codex voice

1. Use Codex's visible `Dictate`, `Transcribe and send`, and `Stop dictation`
   controls. Resolve the current state on every controller press.
2. Map `D-pad right` to a non-hold voice toggle and the DualSense `Mute`
   button to emergency dictation cancellation.

Validated on the paired Bluetooth controller:

- `D-pad right` clicked `Dictate`; a second tap clicked
  `Transcribe and send`, and the recognized phrase arrived in Codex as a user
  message.
- During active dictation, the DualSense `Mute` button clicked
  `Stop dictation`; the recording closed without sending a message.
- Handy is not part of the runtime path.

### M5 — feedback and service packaging

1. Convert adapter state to a single feedback state machine.
2. Rate-limit and coalesce Bluetooth output reports.
3. Reset outputs on disable, disconnect, adapter error, and shutdown.
4. Add reconnect backoff, a watchdog, structured logs, and a launchd plist.
5. Run end-to-end tests for every action before enabling login startup.

Validated on the paired Bluetooth controller:

- Powering the controller off produced a clean disconnect and retries at
  1, 2, 4, and 8 seconds.
- Powering it back on produced a new HID path and a fresh `ready` state without
  restarting the daemon.
- The first action after reconnection was rejected as `disabled`, proving that
  the frontmost-app gate fails closed across transport loss.
- The combined enabled-state report produced the expected blue lightbar and
  center player LED on hardware.
- The generated launchd plist passed `plutil -lint` and uses a stable
  `/opt/homebrew/bin/node` path. It remains intentionally uninstalled until
  login startup is explicitly authorized.

## Final Bluetooth acceptance matrix

| DualSense input | Codex result | Status |
| --- | --- | --- |
| R2 | Allow once | Passed |
| R1 | Allow similar commands | Passed |
| L2 | Deny | Passed |
| Square | Stop current operation | Passed |
| L1 | Toggle between last two opened tasks | Passed |
| Circle | Activate Codex globally | Passed |
| Create | New chat | Passed |
| D-pad up/down | Next/previous task | Passed |
| D-pad right | Dictate / transcribe and send | Passed |
| Mute | Cancel dictation without sending | Passed |
| Power off/on | Reconnect with disabled state | Passed |

### Optional M6 — owned app-server mode

Start a separate bundled app-server instance, create/resume threads owned by
that connection, and use generated protocol types from the same bundled
binary. Keep this mode separate from Codex Desktop UI control.
