# DualSense Agent Control

Bluetooth-only DualSense control surface for Codex Desktop on macOS.

The project is being built hardware-first. The initial gate verifies that the
controller can be read and controlled over Bluetooth before any agent adapter
is enabled.

## Bluetooth spike

Pair the controller in macOS, then run:

```sh
npm run spike:bt -- list
npm run spike:bt -- input
npm run spike:bt -- feedback --confirm-output
```

`list` only enumerates matching HID devices. `input` reads controller events
without sending output reports. `feedback` is the only command allowed to
change the lightbar, player LEDs, or rumble, and it requires the explicit
`--confirm-output` flag. USB devices are rejected by both active commands.

## Safe core simulator

The control engine starts locked. `Circle` is the only global action: it
simulates bringing Codex to the front, which unlocks the remaining bindings.
Test the mapping without controlling any application:

```sh
npm run simulate
circle press
right.trigger.button press
mute press
```

Bindings live in `config.json`. The simulator accepts
`<control> <press|release>` lines and prints normalized decisions as JSON.

The currently validated Codex approval bindings are:

- `R2`: `Allow once`
- `R1`: `Approval options` → `Allow similar commands`
- `L2`: `Deny`

All three approval paths have been exercised end-to-end over Bluetooth on the
paired controller. The daemon resolves a single enabled Accessibility element
by its exact live label and derives mouse coordinates from that element's
current frame; it does not store fixed screen coordinates.

The validated, corrected architecture and delivery gates are documented in
`docs/implementation-plan.md`.

## Daemon

The end-to-end daemon derives its lock state from the frontmost application.
Outside Codex, only `Circle` is accepted. When Codex becomes frontmost, the
remaining controls unlock automatically. By default the daemon does not mutate
Codex or start its built-in dictation:

```sh
npm run daemon
```

Enable the two external mutation boundaries independently only after dry-run
validation:

```sh
npm run daemon -- --enable-actions
npm run daemon -- --enable-voice
npm run daemon -- --enable-actions --enable-voice
```

Codex controls:

- `Circle`: bring Codex to the front and unlock its controls
- `Create`: create a new Codex chat
- `Triangle`: clear the complete draft from the Codex input field
- `L1`: toggle back and forth between the last two opened Codex tasks
- `D-pad left`: cycle through the enabled built-in permission modes
  (`Ask for approval`, `Approve for me`, and `Full access`)
- `D-pad right`: toggle between `Dictate` and `Transcribe and send`
- `D-pad up` / `D-pad down`: visually up / down through Codex task history
- DualSense `Mute`: `Stop dictation` without sending

Task navigation invokes Codex's `Previous Chat` and `Next Chat` menu actions
through Accessibility. It does not synthesize Command-key events, so Codex's
numbered Command shortcut hints do not obscure task activity icons.

Permission-mode switching resolves the live control below the composer, opens
its picker with a mouse click derived from the current Accessibility frame,
selects the next enabled built-in mode, and verifies that the selector changed.
It fails closed while the picker is unavailable or if a mode needs additional
confirmation.

Voice state is resolved from the currently visible Codex controls on every
press. It is not inferred from a potentially stale local toggle.

Input clearing resolves exactly one enabled, editable Accessibility text area
in the focused Codex window and sets its value to empty. It fails without
changing anything if Codex is not frontmost or the input cannot be resolved
unambiguously.

Codex attention notifications produce two short DualSense vibration pulses.
The daemon watches the application's live Accessibility activity cards,
ignores `Running` cards, and reacts when a new card requires attention.
Existing cards form a silent baseline after daemon or Codex restart, so startup
does not replay old notifications. This feedback can occur while Codex is in
the background; controller actions remain locked until Codex is frontmost.
The daemon remains alive when the controller is powered off. It retries
Bluetooth discovery with capped exponential backoff, accepts a new macOS HID
path after reconnection, and keeps actions locked until Codex is frontmost.

Generate a local launchd package for inspection:

```sh
npm run package:launchd
plutil -lint dist/com.codex.dualsense-control.plist
```

Generation does not install or load the agent. The plist uses stable absolute
runtime paths, enables both Codex action boundaries, and writes logs under
`~/Library/Logs/DualSenseCodex`.
