# Expanded Comparison Workspace Design

## Summary

When the user enters artifact comparison mode, the artifact workspace should expand into the primary work area instead of staying in the narrow right column. The comparison view should give the two artifacts enough horizontal room to read, scan, and compare changes side by side.

The comparison selection flow remains tree-driven: users still click `对比`, pick or adjust the start/end nodes from the tree, and click `退出对比` to return to the normal creative layout.

## Problem

The current comparison UI renders two artifact previews inside the existing right-side artifact column. On medium-width screens, and especially in the mobile/unified layout breakpoint, that leaves the comparison panes too narrow. The screenshot shows the result: two long social-post cards squeezed into a small area, making the comparison feel like a cramped preview rather than a real diff workspace.

## Goals

- Give comparison mode a clearly larger reading area.
- Preserve the current tree-based start/end selection behavior.
- Keep `退出对比` visible and obvious.
- Show a true left/right comparison surface instead of two tiny stacked cards.
- Return to the normal tree plus artifact plus options layout after exiting comparison mode.

## Non-Goals

- Do not replace the tree selection model with a separate picker.
- Do not add direct publishing, editing, or save behavior to comparison mode.
- Do not change artifact generation, branch selection, or current artifact selection semantics.
- Do not introduce a modal overlay unless the expanded workspace proves insufficient.

## Layout Decision

Add an app-level comparison layout state derived from `Boolean(artifactComparison)`.

Normal layout stays the same:

- Desktop: tree/options on the left, artifact workspace in the right column.
- Mobile/narrow: unified artifact/options flow with collapsible tree.

Comparison layout changes the outer structure:

- The artifact panel spans the full content width below the topbar.
- The tree becomes selection context rather than the dominant canvas.
- The options/current-question region is hidden while comparison is active.
- The artifact workspace receives a comparison class so its body can use more horizontal and vertical space.

This keeps comparison in the main page instead of a modal, while still giving it enough space to work.

## Desktop Behavior

On screens above the mobile breakpoint:

- `.app-shell` gains a comparison-mode class, for example `.app-shell--comparison`.
- The artifact mobile panel wrapper can span both grid columns while comparison is active.
- The ordinary `.canvas-region` should become a compact comparison selector band while comparison is active, not a full-height primary canvas.
- `ArtifactWorkspace` keeps the `产物` header, `退出对比`, and skill button.
- The comparison view fills the available artifact body area.

The user should see one primary comparison workspace, not a narrow side panel.

## Mobile And Narrow Behavior

At the existing mobile breakpoint:

- Comparison mode should prioritize the artifact comparison workspace above the question/options flow.
- The options region should be hidden while comparison is active.
- The tree toggle remains available for changing comparison endpoints, but the comparison workspace should not share the same cramped vertical stack with the options cards.
- Exiting comparison mode restores the current unified mobile layout.

This addresses the screenshot case where the comparison surface is too small.

## Comparison View

Keep `ArtifactComparisonView` generic, but make it more diff-oriented:

- Render the status as a compact comparison summary: `{from} -> {to}`.
- Keep left pane as the start artifact and right pane as the end artifact.
- Each pane should have its own scroll area so long artifacts can be compared without making the whole page unwieldy.
- Use a responsive grid:
  - Two columns when there is enough width.
  - One column only on very narrow screens where two columns would become unreadable.

The existing social-post renderer already supports inline diff when it receives a previous artifact, but comparison previews currently render artifacts independently. This design's first implementation is the expanded side-by-side comparison workspace. A custom cross-artifact semantic diff engine is explicitly out of scope.

## Data Flow

No API or persistence changes are needed.

- `TreeableApp` already owns `artifactComparison`.
- `ArtifactWorkspace` already receives `isComparisonMode`, `comparisonArtifacts`, `comparisonLabels`, and `comparisonSelectionCount`.
- Add layout classes derived from `artifactComparison` and pass any necessary comparison class to the workspace surface.
- Keep existing comparison node selection logic unchanged.

## Accessibility

- Preserve the `aria-pressed` state on the `对比` / `退出对比` button.
- Preserve the artifact workspace `complementary` region and `产物` label.
- Use clear status text for selected comparison endpoints.
- Avoid hiding focusable controls in a visually hidden area; if the options region is hidden in comparison mode, it should not remain keyboard-focusable.

## Testing

Add focused tests for:

- Entering comparison mode adds the app-level comparison layout class.
- The artifact panel expands across the main layout while comparison mode is active.
- The mobile/unified options region is hidden or omitted while comparison mode is active.
- Exiting comparison mode removes the comparison layout class and restores the normal mobile/unified structure.
- `ArtifactWorkspace` comparison CSS gives the comparison grid a larger, scrollable two-pane surface.

Existing comparison behavior tests should continue to cover:

- Starting comparison selects default from/to nodes.
- Clicking tree nodes updates comparison endpoints.
- `退出对比` clears comparison mode.

## Out Of Scope

- A modal or separate route for comparison.
- A custom semantic diff engine shared across artifact types.
- Editing either artifact directly from comparison mode.
- Persisting comparison sessions.
