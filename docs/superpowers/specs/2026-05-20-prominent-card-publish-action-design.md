# Prominent Card Publish Action Design

## Summary

Move the social-post `发布` entry out of the compact card heading action cluster and turn it into a prominent fixed primary action inside the social post card.

The publish assistant stays owned by `SocialPostRenderer`. Its platform tabs, copy formatting, clipboard behavior, image prompt section, and error handling remain unchanged. This change is only about visual hierarchy and placement.

## Problem

`发布` is an important finishing action, but it currently sits beside `编辑` in the small `社媒内容` heading row. In that location it reads like a secondary card utility rather than the primary next step for a finished artifact.

## Decision

Keep the publish action inside the social-post card, but separate it from the heading row:

- The `社媒内容` heading row keeps the content type label and `编辑`.
- `发布` becomes a fixed primary action at the lower right of the visible social-post card.
- The button keeps the send icon, `aria-expanded`, disabled busy state, and existing click behavior.
- Opening `发布` continues to show the existing `发布助手` dialog.
- The button should stay visible while reviewing a long post by anchoring it to the card surface rather than placing it inside the scroll body.

This preserves the user's chosen direction: publish remains contextually attached to the rendered artifact, while gaining enough visual weight to feel like a major workflow action.

## Layout

The social post card is already a positioned panel with an internal scroll area. Use that boundary:

- Render `发布` as a sibling of the scroll body, not inside the scroll body.
- Position it at the lower right of `.social-post-panel`.
- Add a little bottom padding to the scroll area so the fixed action does not cover final content.
- Keep the existing publish panel anchored near the upper right, because it is a dialog surface and should not cover the action button by default.

The button should use the existing compact button language, but with primary color and stronger presence than `编辑`. It should not become a full-width bottom bar.

## Behavior

No behavior changes:

- `发布` toggles `isPublishPanelOpen`.
- It clears copy error and copied state before toggling.
- It is disabled while `isBusy`.
- It closes when the artifact changes through the existing effect.
- If publish is open and the user clicks `编辑`, close the publish panel before entering edit mode so the two modes do not visually overlap.

## Accessibility

- Preserve the `aria-expanded` relationship on the publish button.
- Preserve `aria-label="发布助手"` on the dialog.
- Ensure the fixed action is reachable in normal tab order after the card heading and before or after the scroll body in a predictable way.
- Do not hide the button behind scrolling content or clipped containers.

## Testing

Update focused social-post renderer tests:

- `发布` still opens the publish assistant.
- The publish button is no longer inside the `.social-post-panel__actions` heading cluster.
- The publish button is rendered as the prominent card action container.
- Busy state still disables the publish button.

The existing copy-format behavior does not need broad retesting for this placement change.

## Out Of Scope

- Moving publish to the global app header or artifact workspace header.
- Changing supported platforms.
- Changing publish text formatting.
- Making direct platform posting, login, upload, or publishing history.
- Refactoring artifact plugin boundaries.
