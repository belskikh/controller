# Standard model and Power controls plan

## Decision

Add a modal controller layer behind the currently unassigned DualSense
`Cross` button. The layer controls only the compact, standard model picker:

- `Cross` opens or closes the compact model picker.
- `D-pad left/right` moves the `Power` slider one enabled step toward
  `Faster`/`Smarter`.
- `D-pad up` selects Fast mode.
- `D-pad down` selects Standard mode.
- `Circle` closes the picker.

Outside this modal layer, every validated v0 binding keeps its current
behavior.

The current `main` also keeps the touchpad pointer active while this picker is
open. The first implementation will not pause, stop, or otherwise coordinate
the pointer stream with picker state. This is an explicit simplicity tradeoff:
the operator is expected not to swipe or click the touchpad while changing
Power or speed. If simultaneous use proves problematic on hardware, pointer
suppression can be added later as a separate fix.

This plan deliberately excludes the `Advanced` picker. In the standard picker,
`Power` is not a raw reasoning-effort value. Each slider stop is a live,
catalog-provided bundle of model and reasoning effort. Fast mode is a separate
service tier that increases speed and usage. The implementation must therefore
discover and operate the currently exposed choices instead of storing a model
list or reasoning-effort enum.

## Confirmed UI behavior

The current Codex desktop app exposes one composer popup control whose title
combines the selected model and reasoning level, for example
`5.6 Sol High`. Its compact menu exposes:

- a visually hidden keyboard control named `Power`;
- an `Advanced` view toggle;
- a checkbox-like Fast mode item whose accessible label is either
  `Enable fast mode` or `Enable standard mode`.

The `Power` control documents Left/Right arrow adjustment. Fast mode selection
prevents the menu's default close behavior, so speed can be changed without
leaving the compact picker. The default app shortcut for opening the picker is
`Control+Shift+M`, but the controller integration should prefer the uniquely
resolved live composer control so customized app shortcuts do not break it.

These details are compatibility evidence for the current app build, not a
stable private API. The implementation must keep all UI matching narrow,
runtime-validated, and fail-closed.

Product semantics are documented in the current Codex
[Models](https://learn.chatgpt.com/docs/models) and
[Speed](https://learn.chatgpt.com/docs/agent-configuration/speed) guides.

## Controller interaction

| Controller state | Input | Result |
| --- | --- | --- |
| Picker closed | `Cross` | Resolve the active composer, open its compact model picker, and enter picker state only after the popup is verified |
| Picker open | `Cross` | Close the popup with `Escape` and leave picker state |
| Picker open | `Circle` | Close the popup with `Escape` and leave picker state |
| Picker open | `D-pad left` | Move `Power` one available step toward `Faster` |
| Picker open | `D-pad right` | Move `Power` one available step toward `Smarter` |
| Picker open | `D-pad up` | Select Fast mode; no-op if it is already selected |
| Picker open | `D-pad down` | Select Standard mode; no-op if it is already selected |
| Picker open | Any other mapped action | Close and clear picker state, then dispatch the normal action |
| Picker closed | Any D-pad direction | Preserve the existing task, permission-mode, and voice bindings |

Changes in the compact picker are immediate. `Circle` and the second `Cross`
close the popup; they do not roll back Power or speed changes. The UI has no
transactional confirm/cancel boundary, so the controller must not promise one.

The directional speed bindings are intentionally idempotent instead of using a
single blind toggle. If local state and UI state ever diverge, `D-pad up` still
means Fast and `D-pad down` still means Standard.

## State and safety model

Add one ephemeral engine state:

```text
closed --Cross + verified popup--> open
open   --Cross/Circle-----------> closed
open   --focus loss/error-------> closed
open   --other action-----------> closed, then normal dispatch
```

The state is routing convenience, not evidence that the popup still exists.
Every picker action must re-resolve the live UI. If the user closes the popup
with the mouse or keyboard, the next controller action detects that it is gone,
clears picker state, reports a safe failure, and does not fall through to the
normal D-pad action from the same press.

Clear picker state on:

- frontmost-Codex loss;
- Bluetooth disconnect and reconnect;
- HID or adapter error;
- daemon shutdown;
- task navigation and task creation;
- any non-picker action.

Do not send a cleanup key after Codex has lost focus. Clearing local state is
enough; the frontmost gate must remain fail-closed and must not send input to a
different application.

## Accessibility boundary

Extend the native helper with narrow operations rather than a general-purpose
menu or pointer API:

1. Resolve the single visible editable composer in the focused Codex window.
2. Within that composer subtree, resolve exactly one model/reasoning
   `AXPopUpButton`.
3. Open it through the live element. A live-frame mouse click is acceptable
   only after the unique element and its current AX frame are validated.
4. Verify compact view:
   - `Show advanced options` means compact view is active.
   - `Show compact options` means Advanced is active; activate that live item
     first and re-resolve the compact controls.
5. For Power adjustment, focus the unique enabled `Power` item and send one
   Left or Right arrow event. Never infer the number or names of slider stops.
6. For speed selection, resolve the unique enabled Fast-mode checkbox item,
   inspect whether its action is `Enable fast mode` or
   `Enable standard mode`, and press it only when the requested state differs.
7. Re-read the relevant controls after mutation and return a structured result
   describing `changed`, `alreadySelected`, `atBoundary`, or `unavailable`.

Possible helper commands:

```text
model-power open --bundle-id com.openai.codex
model-power close --bundle-id com.openai.codex
model-power adjust --bundle-id com.openai.codex --direction decrease|increase
model-power speed --bundle-id com.openai.codex --mode standard|fast
model-power inspect --bundle-id com.openai.codex
```

All commands must retain the existing trust, single-running-application,
frontmost-bundle, unique-match, enabled-element, and live-frame checks.
`inspect` and dry-run invocations must not mutate the UI.

The current controls do not expose stable AX identifiers and their accessible
labels are localized. The first implementation can keep the repository's
existing English-label support boundary, but it must fail clearly on any
unrecognized or ambiguous UI rather than falling back to positions or a broad
key sequence. A later localization pass can add exact reviewed label sets.

## TypeScript changes

### Actions and configuration

Add explicit semantic actions rather than leaking arrow-key details into the
daemon:

```text
modelPower.toggle
modelPower.close
modelPower.decrease
modelPower.increase
modelPower.fast
modelPower.standard
```

Keep `config.version` at `1` and bind only `cross.press` to
`modelPower.toggle` in `config.json`:

```json
"cross": {
  "press": "modelPower.toggle"
}
```

No model list, Power-stop list, selected effort, Fast-mode value, or picker
state belongs in controller configuration. Those values remain owned by the
live Codex composer.

The first version treats the four modal D-pad meanings as feature behavior,
not user-configurable bindings. The coordinator reroutes those physical
controls while picker state is open; their existing configured actions remain
unchanged outside the modal state. This avoids a config-schema migration for
one small fixed modal layer. General contextual remapping remains part of the
separate user-profiles backlog.

No new daemon flag is needed. The existing `--disable-actions` switch covers
model/Power mutations in the same way that it covers approvals, navigation,
permission mode, and the touchpad pointer.

### Engine

- Track `modelPowerOpen`.
- Enter the state only after the adapter reports that the compact popup is
  open. Because the current engine is synchronous, represent open success as a
  daemon acknowledgement or move the modal state into a small coordinator
  beside the adapter; do not optimistically mark it open before UI validation.
- Consume picker D-pad presses even when the adapter reports `unavailable`, so
  a stale modal state cannot accidentally navigate tasks, toggle permissions,
  or start voice input.
- Reset the state through the existing disable/synchronize paths and every
  transport teardown.

The acknowledgement detail needs to be settled before implementation. A
coordinator owned by the connected daemon session is the smaller change and
keeps UI truth out of the pure routing engine; an engine command/result pair is
more explicit but broadens the engine contract. Prefer the coordinator unless
tests show that modal routing becomes difficult to reason about.

### Adapter and client

- Add standard-picker methods to `AgentAdapter` and
  `CodexAccessibilityAdapter`.
- Add typed request/response methods to `MacOSControlClient`.
- Keep raw accessibility labels and helper JSON parsing below the adapter.
- Emit structured logs with the requested operation and result, but do not
  persist a catalog or assume that a title maps to a fixed model.

## Validation against current main

Validated against `main` at `0d86ab2` (`Add Codex-gated DualSense touchpad
pointer`):

| Current-main area | Compatibility result |
| --- | --- |
| `config.json` | `Cross` is still unassigned. The new `touchpad.button -> pointer.click` entry remains unchanged; adding the one Cross binding is additive. |
| Config schema | Version 1 already supports flat physical bindings and needs no structural change. `ACTIONS` and config tests must learn the new semantic action names. |
| D-pad | All four existing bindings are unchanged, so closed-picker behavior remains the validated baseline. Modal rerouting can be layered on top. |
| `src/core/engine.ts` | No new main-side state was added. A small picker coordinator can be introduced without merging two competing state machines. |
| `src/daemon.ts` | The pointer stream added parameters and lifecycle cleanup. Picker dispatch must preserve those arguments and cleanup paths, but there is no action-name collision. |
| Native helper | `pointer-stream` is a long-running command. Model/Power operations can remain narrow one-shot commands in separate helper processes; no shared native state is required. |
| Accessibility adapter | Current main did not change composer or model-picker resolution. The previously inspected AX assumptions still apply to the current app build. |
| Tests | Current main passes TypeScript checking, 19 test files / 70 tests, and the native helper build before model-control work begins. |
| Documentation | Both touchpad and model-control backlog updates are retained after rebasing the plan branch. |

There are no source-level blockers from current main. The only newly introduced
interaction is simultaneous touchpad use, and this plan intentionally defers
special handling for it.

## Implementation sequence

### Phase 1 — read-only compatibility spike

1. Add `model-power inspect` in dry-run form.
2. Verify the active composer and compact controls are uniquely resolvable.
3. Record the current AX roles, labels, actions, and popup-open/closed
   detection in helper tests or fixtures.
4. Stop if the Power control cannot be focused without geometry or if Fast
   state cannot be read deterministically.

This gate produces no controller mutation.

### Phase 2 — narrow native mutations

1. Implement open/close with frontmost and unique-element checks.
2. Implement one-step Power adjustment and endpoint reporting.
3. Implement idempotent Fast/Standard selection.
4. Verify each result by re-reading live UI.
5. Exercise dry-run before enabling `--confirm`.

### Phase 3 — modal routing

1. Add semantic actions and the `Cross` binding.
2. Add the session-scoped modal coordinator.
3. Reroute D-pad input only while the verified popup is open.
4. Add every focus, transport, error, navigation, and shutdown reset.
5. Preserve the global `Circle` behavior when the picker is closed.

### Phase 4 — documentation and hardware validation

1. Update README, the controller-map image, action matrix, and backlog.
2. Run the complete static and unit verification set.
3. Stop any existing daemon only with explicit authorization, then run the new
   daemon from this worktree for paired Bluetooth validation.
4. Do not package, install, or load a launchd agent without separate explicit
   authorization.

## Automated test matrix

### Engine/coordinator

- `Cross` opens only while Codex is frontmost.
- A second `Cross` closes and clears state.
- `Circle` closes while open and activates Codex while closed.
- Each D-pad direction retains its validated action while closed.
- Each D-pad direction produces only its picker action while open.
- A stale open state consumes one failed picker press and resets without
  dispatching the normal D-pad action.
- Any other action closes first, then dispatches once.
- Focus loss, disconnect, adapter error, and shutdown reset state.
- Reconnect starts closed and disabled.
- Debounce behavior remains per physical control and phase.

### Adapter/client

- Exactly one composer trigger succeeds; zero or multiple fail.
- Advanced view is returned to compact view before control.
- Missing, disabled, duplicated, or renamed Power/Fast items fail closed.
- Power left/right sends one step only.
- A slider endpoint is a successful no-op, not an error.
- Fast and Standard requests are idempotent.
- Dry-run reports intended targets without opening or changing the picker.
- Post-action verification detects a UI mutation that did not take effect.

### Regression

- Approval, interrupt, draft clear, voice, task navigation, permission mode,
  pointer, attention feedback, watchdog, and reconnect tests remain green.
- No USB fallback is introduced.
- No hard-coded coordinates or fixed model/effort catalog is introduced.

## Paired Bluetooth acceptance matrix

| Scenario | Expected result |
| --- | --- |
| `Cross` with Codex frontmost | Compact picker opens in standard view |
| `Cross` with picker open | Picker closes; prior immediate changes remain |
| `D-pad left/right` with picker open | Power moves exactly one enabled stop |
| Power at either endpoint | Further movement is a safe no-op |
| `D-pad up` with picker open | Fast mode is selected |
| Repeated `D-pad up` | No additional change |
| `D-pad down` with picker open | Standard mode is selected |
| Repeated `D-pad down` | No additional change |
| D-pad with picker closed | Existing navigation/permission/voice action runs |
| Picker closed manually, then D-pad | No normal D-pad action leaks through that stale press |
| Codex loses focus while picker is open | Local modal state clears; no key is sent elsewhere |
| Controller reconnects | Picker state is closed and controller starts disabled |
| Advanced was left open manually | Controller returns to compact view before acting |

Simultaneous touchpad swipe/click while the picker is open is not part of this
acceptance matrix. The current pointer behavior remains unchanged.

## Required verification

Before committing implementation:

```sh
npm run check
npm test
make -C helpers/macos-control
git diff --check
```

The feature is done only after the paired-controller matrix passes on Bluetooth
and the validation record distinguishes automated checks from live hardware
results.

## Out of scope

- Choosing an exact model in `Advanced`.
- Choosing an exact named reasoning-effort level in `Advanced`.
- Persisting a hard-coded model or Power catalog.
- USB controller fallback.
- Coordinating or suppressing the current touchpad pointer while the picker is
  open.
- General pointer control or fixed screen coordinates.
- App-server ownership or private Electron IPC.
- Installing or loading the generated launchd agent.
