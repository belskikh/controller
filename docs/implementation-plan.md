# Controller: validated implementation plan

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
                         +-> guarded native pointer stream
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
6. Keep relative pointer input in a persistent helper that checks Codex's live
   frontmost bundle before every mouse event.

### M3 — Codex Desktop adapter

1. Detect Codex as the frontmost app.
2. Inspect the focused window for visible approval controls.
3. Map `Allow once`, `Deny`, and the single broader approval option offered by
   Codex (`Allow similar commands` or `Allow all edits`) only when a unique
   matching control exists.
4. Map interrupt and task navigation through verified UI actions or
   known shortcuts.
5. Add a dry-run trace showing the intended target before enabling mutations.

Validated on the paired Bluetooth controller:

- `R2` clicked the exact `Allow once` button and completed a harmless command.
- `L2` clicked the exact `Deny` button and rejected a harmless command.
- `R1` opened `Approval options`, clicked the exact
  `Allow similar commands` menu item, and completed a harmless command.
- R1 also clicked the exact `Allow all edits` menu item during an edit approval
  and completed a harmless temporary-file operation.
- `Square` clicked the exact `Stop` control and interrupted a running Codex
  operation.
- `D-pad up` and `D-pad down` navigate visually up and down through Codex task
  history. This path remains separate from the L1 quick-toggle state.
- `L1` alternates Codex's verified Previous Chat and Next Chat menu actions,
  providing a two-task quick toggle. D-pad navigation resets the next L1 press
  to Previous Chat. Invoking the menu actions through Accessibility avoids
  leaving Codex's numbered Command shortcut hints over the task activity icons.
- `D-pad left` cycles through the enabled built-in permission modes exposed by
  the live composer control. Selection and confirmation use only current
  Accessibility elements and fail closed if the picker is unavailable.
- Electron's reported `AXPress` success is not sufficient for these custom
  controls. Both the approval buttons and the popup menu item require a
  mouse click derived from the unique enabled element's live AX frame.

Added after the validated v0 baseline: `Triangle` resolves the single editable
text area in the focused Codex window and clears its value. The action fails
closed when the field is missing or ambiguous. The full Bluetooth path was
validated on the paired controller: pressing `Triangle` cleared a populated
Codex input draft.

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
3. Clear visual indicators without rumble on disable, and reset outputs on
   disconnect, adapter error, and shutdown.
4. Add reconnect backoff, a watchdog, structured logs, and a launchd plist.
5. Watch Codex's Accessibility activity cards and emit a double vibration
   pulse when a new non-running card requires attention.
6. Run end-to-end tests for every action before enabling login startup.

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

### M6 — Codex-only touchpad pointer

1. Treat a new DualSense touch contact as an anchor and emit movement only for
   subsequent samples with the same contact ID.
2. Apply reduced linear sensitivity and reject discontinuities so contact
   changes cannot jump the cursor.
3. Map the physical touchpad press to one primary click at the live cursor
   location.
4. Require both the daemon's enabled state and a native frontmost-Codex check
   for every movement or click.
5. Destroy the native stream on focus-monitor failure, disconnect, HID error,
   watchdog timeout, and shutdown.

The tracking and command path are covered by automated tests. Pointer feel and
the full Bluetooth path still require validation on the paired controller.

### M7 — compact model Power control

1. Open the standard picker through Codex's native `Control+Shift+M` shortcut;
   close it with `Escape`.
2. Focus the hidden Power control with `Home`, then send exactly one Left or
   Right key without resolving the composer or scanning the AX tree.
3. Map left-stick press (`L3`) to a modal layer: left/right changes Power one
   step, up selects Fast, down selects Standard, and `L3` or `Circle` closes.
4. Enter modal routing after the shortcut is sent successfully. Keep the
   frontmost-Codex gate fail-closed before every key or menu action.
5. Reset local picker state without sending UI input after focus loss,
   disconnect, watchdog failure, adapter error, or shutdown.

The native helper and complete paired Bluetooth path have been exercised
against the current Codex compact picker. `L3`, one-step Power changes,
Fast/Standard selection, and close all passed. Hardware testing also exposed
and removed repeated full-tree AX polling that caused multi-second latency.
Opening, closing, and Power adjustment now use only keyboard events;
Fast/Standard retains one bounded live-menu lookup.

## Final Bluetooth acceptance matrix

| DualSense input | Codex result | Status |
| --- | --- | --- |
| R2 | Allow once | Passed |
| R1 | Allow similar commands | Passed |
| R1 | Allow all edits | Passed |
| L2 | Deny | Passed |
| Square | Stop current operation | Passed |
| L1 | Toggle between last two opened tasks | Passed |
| Circle | Activate Codex globally | Passed |
| Create | New chat | Passed |
| Triangle | Clear input draft | Passed |
| L3 | Open/close compact model picker | Passed |
| Left stick left/right while picker is open | Move live Power one step | Passed |
| Left stick up/down while picker is open | Select Fast/Standard | Passed |
| D-pad up/down | Next/previous task | Passed |
| D-pad left | Cycle permission mode | Automated; hardware pending |
| D-pad right | Dictate / transcribe and send | Passed |
| Mute | Cancel dictation without sending | Passed |
| Touchpad swipe | Move pointer while Codex is frontmost | Automated; hardware pending |
| Touchpad press | Primary click at current pointer | Automated; hardware pending |
| Codex attention card | Double vibration pulse | Automated; hardware pending |
| Power off/on | Reconnect with disabled state | Passed |

### Optional M6 — owned app-server mode

Start a separate bundled app-server instance, create/resume threads owned by
that connection, and use generated protocol types from the same bundled
binary. Keep this mode separate from Codex Desktop UI control.
