# Tree Canvas Operation Hint Design

## Goal

Add a persistent corner hint in tree view so users can discover what actions are available inside the tree diagram.

## Selected Direction

Use a lightweight, always-visible hint in the lower-left corner of the tree canvas.

The hint should stay out of the right-side scroll controls and the existing upper-left comparison-mode hint. It should be subtle enough not to compete with branch choices, but readable enough to explain the main tree interactions.

## Behavior

- Render the hint whenever `TreeCanvas` is visible.
- Keep it visible during normal tree browsing, option generation, pending branch generation, terminal-node display, and empty tree state.
- Keep the existing comparison-mode hint unchanged.
- Do not add dismiss, collapse, or first-run state.
- Do not change any tree interactions.

## Hint Copy

The hint should describe the actions already supported by the tree:

- Click a draft/history node to view that draft.
- Click a side branch to switch to that route.
- Drag the tree, use left/right arrow keys, or use scroll controls to browse long routes.
- Choose a direction from the bottom tray when directions are available.

The default on-screen copy is:

`点击节点查看草稿 · 点击旁支切换路线 · 拖动/左右键浏览`

When the bottom direction tray is active, append:

`底部选择方向继续生成`

## Visual Treatment

- Position the hint at the lower-left inside `.tree-canvas`.
- Use a small translucent panel with the same restrained card radius and border language as existing tree overlays.
- Keep pointer events disabled so it never blocks panning or node clicks.
- Use compact Chinese text with wrapping instead of horizontal overflow.
- On mobile, constrain width and font size so it does not overflow the viewport or cover the bottom tray awkwardly.

## Components

- `TreeCanvas`
  - Add a small presentational hint element near the existing comparison hint and empty state.
  - Derive whether direction choices are currently available from the same state that renders `BranchOptionTray`.

- `globals.css`
  - Add styles for the operation hint.
  - Add mobile constraints inside the existing `@media (max-width: 640px)` block.

## Testing

- Add a `TreeCanvas` rendering test that the operation hint is present in normal tree view.
- Assert the hint contains the key supported actions: viewing nodes, switching side branches, and browsing by drag/arrow keys.
- Add or update CSS assertions for lower-left positioning, disabled pointer events, wrapping, and mobile width constraints.

## Out Of Scope

- No guided tour.
- No persisted dismiss state.
- No new keyboard shortcuts.
- No changes to branch selection, route activation, comparison selection, or generation behavior.
