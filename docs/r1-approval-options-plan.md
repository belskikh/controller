# R1 approval-option compatibility plan

## Implementation status

Implemented and validated on the paired Bluetooth controller. R1 selected
`Allow all edits` for a harmless temporary-file approval, and a repeated R1
press after the approval disappeared failed closed without another UI action.
The multi-label native press reduced the measured live action time from
1.08–1.16 seconds to 0.72 seconds.

## Goal

Make the existing R1 action select the broader approval option offered by the
current Codex request:

- `Allow similar commands` for command approvals.
- `Allow all edits` for edit approvals.

R1 must continue to fail closed when Codex is not frontmost, Accessibility is
unavailable, the approval menu is absent, or the matching option is missing or
ambiguous.

## Current behavior and cause

The physical binding and routing are working:

1. `config.json` maps `right.bumper` to `allowSimilarCommands`.
2. `src/daemon.ts` dispatches that action to
   `CodexAccessibilityAdapter.allowSimilarCommands()`.
3. The adapter opens the exact `Approval options` pop-up with a live-frame
   mouse click.
4. It then searches for exactly one enabled menu item named
   `Allow similar commands` and clicks its live AX frame.

Step 4 has only one hard-coded accepted label. When an edit approval exposes
`Allow all edits` instead, the native helper finds zero matching menu items and
fails. This is expected from the current implementation rather than a DualSense
input or engine-routing problem.

## Recommended design

Keep the existing controller action identifier for configuration compatibility,
but generalize the adapter's approval-option selection.

1. Add `allowAllEdits: "Allow all edits"` to `CodexControlLabels`.
2. After opening `Approval options`, pass both exact menu-item labels to one
   native `pressOneOf()` operation.
3. Traverse the Accessibility tree once and continue only if exactly one
   enabled candidate exists across both allowed labels.
4. Click the exact selected label from that same traversal with the mouse
   position derived from its live AX frame.
5. Throw `CodexAccessibilityError` without clicking when neither label exists,
   either label is duplicated, or both labels are present.

This keeps the accepted surface narrow: R1 can click only one of two explicit
labels, still requires a unique live AX element, and still derives the mouse
position from its current frame. No hard-coded coordinates, fuzzy text match,
USB behavior, or launchd changes are needed.

Do not implement the behavior by catching a failed press of the first label and
blindly trying the second. A failed press can mean ambiguity, loss of focus, or
another AX error, not only "label absent"; swallowing it would weaken the
fail-closed contract.

The native multi-label press does not introduce an arbitrary sleep. It removes
the two preliminary full-tree match traversals while retaining the validated
open-then-select sequence.

## Planned changes

### Adapter

- Extend `CodexControlLabels` and `DEFAULT_CODEX_CONTROL_LABELS` with
  `allowAllEdits`.
- Add a multi-label native press path that checks both labels in one traversal
  and returns the sole exact match.
- Preserve dry-run behavior: inspect/open the pop-up with `confirm: false`, but
  do not attempt to inspect or click menu items because the menu was not
  actually opened.
- Preserve mouse dispatch for the pop-up and selected menu item.
- Keep the historical `allowSimilarCommands` action and method name in this
  patch to avoid invalidating existing `config.json` files. A semantic rename
  can be a separate compatibility migration if desired.

### Tests

Update the fake control client so match results are configurable, then cover:

- Only `Allow similar commands` exists: R1 selects it.
- Only `Allow all edits` exists: R1 selects it.
- Neither exists: the adapter fails and performs no menu-item click.
- Both exist: the adapter fails as ambiguous and performs no menu-item click.
- One label has multiple matches: the adapter fails as ambiguous.
- Dry-run mode still does not inspect or click a menu item.
- The selected approval option still uses the live-frame mouse method.
- Existing frontmost-application and Accessibility fail-closed tests remain
  passing.

No engine test should need behavioral changes because the physical R1 binding
and daemon action dispatch stay the same.

### Documentation

- Change the README mapping to describe R1 as selecting the broader approval
  choice offered by Codex, naming both supported labels.
- Update the implementation plan's intended mapping and automated coverage.
- Record `Allow all edits` hardware validation separately; do not mark it
  passed merely because the automated adapter tests pass.

## Validation

Run the repository-required checks:

```sh
npm install
npm run check
npm test
make -C helpers/macos-control
git diff --check
```

Then validate both live approval shapes with Codex frontmost and the paired
Bluetooth controller:

1. Trigger a harmless command approval that offers `Allow similar commands`;
   press R1 and verify the command proceeds.
2. Trigger a harmless edit approval that offers `Allow all edits`; press R1 and
   verify the edits proceed.
3. Press R1 when no approval is visible and verify it fails without another UI
   action.
4. Move focus away from Codex while an approval is visible and verify R1 stays
   locked.

Do not install or load the generated launchd agent during this work.

## Acceptance criteria

- The same physical R1 press selects `Allow similar commands` or
  `Allow all edits`, depending on which exact unique option Codex exposes.
- R1 never selects an unrecognized approval option.
- Missing and ambiguous UI states fail without a menu-item click.
- The frontmost gate remains fail-closed.
- Bluetooth-only behavior and all other validated v0 mappings remain
  unchanged.
