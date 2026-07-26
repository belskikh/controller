# Controller

This repository contains a work-in-progress controller daemon for AI
applications on macOS. The only supported integration today is Bluetooth-only
DualSense control for Codex Desktop. Version `v0` has been validated on the
paired controller and should be treated as the working baseline.

## Development workflow

- By default, all changes and new features must be developed in a dedicated
  Git worktree, not on `main` and not in the currently checked-out branch.

## Safety and scope

- Support Bluetooth only. Do not add USB fallback behavior.
- Outside Codex, every controller action is locked except `Circle`, which
  activates Codex.
- Keep the frontmost-application gate fail-closed across startup, disconnect,
  reconnect, adapter errors, and shutdown.
- Never use hard-coded screen coordinates. Resolve a unique live
  Accessibility element and derive any mouse click from its current AX frame.
- Keep Cursor, Handy, and general pointer control out of this project.
- Do not install or load the generated launchd agent without explicit user
  authorization.

## Validated v0 mapping

| DualSense input | Codex action |
| --- | --- |
| Circle | Activate Codex globally |
| Create | Create a new chat |
| L1 | Toggle between the last two opened chats |
| D-pad up/down | Navigate visually up/down through chat history |
| D-pad right | Start dictation / transcribe and send |
| Mute | Cancel dictation without sending |
| R2 | Allow once |
| R1 | Allow similar commands |
| L2 | Deny |
| Square | Stop the current operation |

`L1` alternates Codex's `Previous Chat` and `Next Chat` shortcuts. A D-pad
navigation action resets the next L1 press to `Previous Chat`. Voice control
requires `--enable-voice`; all other mutations require `--enable-actions`.

## Commands

```sh
npm install
npm run check
npm test
npm run daemon -- --enable-actions --enable-voice
```

The daemon command builds TypeScript and the native helper before starting.
It must run in a macOS process that already has Accessibility permission.

Additional diagnostics:

```sh
npm run spike:bt -- list
npm run spike:bt -- input
npm run spike:bt -- feedback --confirm-output
npm run simulate
npm run package:launchd
plutil -lint dist/com.codex.dualsense-control.plist
```

## Where to make changes

- `config.json`: physical button bindings.
- `src/core/types.ts`: action names and shared controller types.
- `src/core/engine.ts`: lock, debounce, and routing policy.
- `src/daemon.ts`: action dispatch, transport lifecycle, and foreground gate.
- `src/adapters/codex-accessibility.ts`: Codex actions and chat navigation.
- `src/adapters/codex-voice-accessibility.ts`: native Codex dictation.
- `src/macos/`: TypeScript boundary for the native helper and foreground
  monitor.
- `helpers/macos-control/main.m`: narrow macOS Accessibility operations.
- `src/dualsense/`: Bluetooth HID input, Sony output reports, and feedback.
- `docs/implementation-plan.md`: hardware validation record and acceptance
  matrix.

When adding or renaming an action, update the action list, config binding,
daemon dispatcher, adapter, tests, README, and validation matrix together.
Run `npm run check`, `npm test`, `make -C helpers/macos-control`, and
`git diff --check` before committing.

## Known behavior

- Approval buttons exist only while Codex is asking for approval. Pressing an
  approval binding at any other time safely fails because no unique matching
  control exists.
- Some Electron controls report successful `AXPress` without acting. The
  validated approval path uses a live-frame mouse click for those controls.
- The generated launchd plist is validated but intentionally not installed.
- `dist/`, `node_modules/`, the native helper binary, coverage, and logs are
  generated artifacts and remain untracked.
