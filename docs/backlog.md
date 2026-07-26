# Controller backlog

This backlog records requested work that is not part of the validated v0 baseline. Each item must preserve Bluetooth-only transport, the frontmost-Codex fail-closed gate, and live Accessibility element resolution.

## DualSense controller microphone input

**Goal:** use the paired DualSense controller's built-in microphone for Codex dictation instead of the laptop microphone.

- Establish whether macOS exposes the Bluetooth controller microphone as a selectable input device and document the supported connection and audio-route requirements.
- Select the controller microphone only for the dictation flow; do not change the user's system-wide default input device.
- Fail closed when the controller microphone is unavailable, disconnected, muted, or cannot be selected, and retain the existing cancel-without-send behavior.
- Add tests and a paired-controller validation record covering selection, disconnect/reconnect, mute, and fallback-free failure behavior.

**Done when:** dictation started from the controller records through its microphone while Codex is frontmost, and no laptop-microphone audio is captured or system-wide input setting is changed.

## Composer model and thinking-effort control

**Goal:** bind the currently unassigned `Cross` button to cycle the active composer control between the model selector and the thinking-effort selector; a subsequent `Cross` press moves to the next enabled option in that control. The cycle must be deterministic: `model selector -> thinking effort -> model selector`. `Triangle` keeps its validated draft-clear action.

- Add distinct actions for selecting the next model and the next thinking effort, then retain the small focus-cycle state only while Codex is frontmost.
- Resolve the live composer, selector, and enabled options through Accessibility on every press. Do not use saved screen positions or a fixed list of models/effort levels.
- Fail closed if a unique selector or next option is unavailable; reset the cycle on task navigation, focus loss, disconnect, adapter error, and shutdown.
- Expose the binding in `config.json`; test model-only, effort-only, unavailable-selector, and focus-loss cases.

**Done when:** a paired Bluetooth controller changes only the currently visible Codex composer selector, never changes a setting outside Codex, and emits a dry-run trace before mutations are enabled.

## DualSense touchpad as a pointing surface — blocked by scope decision

**Requested behavior:** moving a finger across the DualSense touchpad moves the macOS pointer; pressing the touchpad sends a primary mouse click.

**Conflict:** the project safety scope explicitly excludes Cursor, Handy, and general pointer control. Existing Codex controls may click only a uniquely resolved, live Accessibility element at its current frame. A free pointer violates that boundary and cannot be added under the current rules.

**Decision required before implementation:** explicitly expand the project scope and define a separate opt-in capability (for example `--enable-pointer`), its macOS permissions, an immediate disable gesture, touchpad scaling/acceleration, and how the frontmost-Codex gate applies.

**If approved, done when:** it is Bluetooth-only and disabled by default; pointer movement and click stop immediately on focus loss, disconnect, adapter error, and shutdown; and tests cover accidental input plus the complete disable path. It must not use fixed screen coordinates for Codex-specific actions.

## User mapping profiles and key reassignment

**Goal:** add a dedicated `profiles/` directory for user-owned mappings and allow safe reassignment of supported controller actions without editing source.

- Create a versioned profile format with a documented default profile and JSON schema; load the selected profile through an explicit daemon option.
- Validate before opening HID: reject unknown controls, duplicate conflicting bindings, unsupported actions, and bindings that bypass global `Circle` activation or the frontmost-Codex gate.
- Keep the shipped default mapping as fallback and report the active profile plus a dry-run mapping trace at startup.
- Provide examples for changing a button binding and restoring defaults; update config validation, tests, README, and the acceptance matrix together.

**Done when:** a user can select a valid custom profile, see its resolved mapping before mutations run, and receives a clear error with no controller actions enabled when the profile is invalid.
