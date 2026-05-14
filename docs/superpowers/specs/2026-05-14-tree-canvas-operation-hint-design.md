# Tree Canvas Operation Hint Design

## Goal

Add a persistent corner hint in tree view so users can discover what actions are available inside the tree diagram.

## Selected Direction

Use a lightweight, floating hint in the lower-left corner of the tree diagram area. The hint is expanded by default and can be collapsed so it does not cover the tree.

The hint should sit inside the tree viewport, not over the bottom direction tray. The operation hint should be subtle enough not to compete with branch choices, but readable enough for a first-time user.

## Behavior

- Render the hint whenever `TreeCanvas` is visible.
- Keep it visible during normal tree browsing, option generation, pending branch generation, terminal-node display, and empty tree state.
- Expand the hint by default on desktop.
- Collapse the hint by default on mobile.
- If the app detects mobile layout after mount, collapse the hint unless the user has already manually expanded or collapsed it.
- Provide a collapse control inside the hint.
- When collapsed, keep a small lower-left control visible so the user can reopen the hint.
- Keep the existing comparison-mode hint unchanged.
- Do not persist the expanded/collapsed state.
- Do not change any tree interactions.

## Hint Copy

The hint should explain what the tree represents and what actions are available:

- Each node is a snapshot from the creation process.
- Clicking a node switches the draft panel to that historical snapshot version.
- Dragging empty space browses nearby branches.

The default expanded copy is:

`树图说明`
`画布中每个节点代表创作过程中的快照。`
`点击节点可以切换到对应的历史快照版本。`
`拖动画布空白处可以查看前后的分支。`

## Visual Treatment

- Position the hint at the lower-left inside the tree viewport.
- Use a small translucent panel with the same restrained card radius and border language as existing tree overlays.
- Keep the panel compact and allow pointer events only on the hint controls.
- Use short line-by-line Chinese text with wrapping instead of a dense single-line sentence.
- In collapsed state, render a small button that reopens the hint.
- On mobile, constrain width and font size so it does not overflow the viewport.

## Components

- `TreeCanvas`
  - Wrap the scrollable tree viewport in a positioned shell.
  - Add a small stateful hint element in that shell so it floats at the tree diagram's lower-left corner.
  - Track expanded/collapsed state locally with `useState`, defaulting to expanded.

- `globals.css`
  - Add styles for the operation hint.
  - Add mobile constraints inside the existing `@media (max-width: 640px)` block.

## Testing

- Add a `TreeCanvas` rendering test that the operation hint is present and expanded in normal tree view.
- Assert the hint contains the plain-language model: nodes as historical snapshots, clicking nodes to switch draft versions, and dragging empty space.
- Add a rendering test proving the hint can collapse and reopen.
- Add or update CSS assertions for lower-left viewport positioning, wrapping, and mobile width constraints.

## Out Of Scope

- No guided tour.
- No persisted collapse state.
- No new keyboard shortcuts.
- No changes to branch selection, route activation, comparison selection, or generation behavior.
