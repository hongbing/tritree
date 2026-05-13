# Style Sample Items Design

Date: 2026-05-13

## Summary

The `我的风格` pasted-sample flow should stop relying on a single ambiguous text box. Users may paste content that already contains blank lines, so Tritree should make each representative work an explicit item while still keeping each item as a generous textarea.

## Goals

- Let users add multiple representative works without learning delimiter rules.
- Preserve internal blank lines inside each work.
- Tell users how many samples and how much text is a reasonable target.
- Send each non-empty item as one sample to the existing generation endpoint.
- Keep the generated draft, streaming preview, save mode, and external one-click flow unchanged.

## UX

The sample step shows:

- Guidance: recommend 2-5 works, roughly 200-1000 Chinese characters each.
- A list of item textareas labeled `代表作 1`, `代表作 2`, etc.
- An `添加一段代表作` button.
- Remove buttons for extra items.
- Per-item character counts.
- A summary such as `已添加 2 段，共 1240 字。样本量不错，可以生成。`

Validation stays soft. One non-empty item is enough to attempt generation, but the UI nudges the user when more material would improve accuracy.

## Implementation Notes

- `StyleProfileSetup` should store samples as `string[]` instead of one `samplesText` string.
- `generateFromSamples` should trim and filter empty items before posting.
- Existing helpers can keep `splitRepresentativeSamples` as a conservative trim-only parser for compatibility, but the UI should no longer depend on blank lines as separators.
- Tests should cover adding/removing sample items, preserving blank lines, summary copy, and the posted `samples` array.
