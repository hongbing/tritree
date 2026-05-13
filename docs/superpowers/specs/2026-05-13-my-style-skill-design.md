# My Style Skill Design Spec

Date: 2026-05-13

## Summary

Tritree should add a `我的风格` interaction on the Seed screen. The feature lets a user turn representative writing samples, or an optional configured external style service, into a normal user-owned style skill. The user reviews and edits the generated skill before saving it, then Tritree automatically enables the saved skill for the current work.

The open-source default path uses Tritree's own AI flow to infer style from pasted samples. Deployments that already have style-generation infrastructure can configure an external provider. When that provider is available, the Seed screen also shows a one-click style generation action that asks the provider for a ready-to-save skill draft.

## Goals

- Add a first-class `我的风格` setup surface to the Seed screen.
- Let users generate a personal style from pasted representative works.
- Let configured deployments expose a one-click external style generation action.
- Return every generation result as an editable skill draft before saving.
- Save the result as a normal user skill with `category = 风格`.
- Automatically enable the saved style skill for the current work.
- Support updating an existing `我的风格：...` skill or creating a new version.
- Keep the existing skill library, skill picker, and generation prompt model intact.
- Preserve multi-user isolation: a user can only generate, save, update, and enable their own style skills.

## Non-Goals

- Do not add a new style profile table.
- Do not add skill metadata or a persisted source field in this version.
- Do not auto-learn style from draft edits or branch choices.
- Do not import style from existing Tritree drafts in this version.
- Do not make representative sample count or length a hard validation gate.
- Do not make the user choose between internal and external model providers.
- Do not expose administrator-triggered style generation for other users.
- Do not make personal style skills default-enabled globally for future works.
- Do not change how system skills are edited or archived.

## Current Context

Tritree already has a user-owned skill system:

- `skills` stores system skills and user skills.
- User skills are created through `POST /api/skills`.
- User skills can be updated through `PATCH /api/skills/:skillId`.
- `session_enabled_skills` stores per-session enabled skill choices.
- `RootMemorySetup` owns the Seed screen's local selected skill ids.
- `SkillPicker` and `SkillLibraryPanel` already display and manage skills.

This feature should build on that model. A generated personal style is just another user skill, not a separate preference object. That keeps prompt injection, session enablement, editing, archiving, and ownership consistent with existing behavior.

## Chosen Approach

Use a Seed-screen style setup component with two possible generation actions:

- `粘贴代表作生成`: always available. The user pastes samples, and Tritree's internal AI turns them into a skill draft.
- `一键生成我的风格`: shown only when an external style provider is configured. Tritree sends the current logged-in user identity to the provider and receives a skill draft.

Both actions produce the same `SkillUpsert` draft shape and feed the same review-and-save flow. The UI should not ask users to choose "internal AI" or "external AI"; it should frame the choice as two natural actions: paste samples, or one-click generate from an integrated style service.

## User Experience

### Seed Screen Placement

Add a `我的风格` workbench near the top of `RootMemorySetup`, before the existing skill picker. This is a deliberate first-class setup surface, not a hidden skill-library action.

When the current work has no enabled personal style, the workbench is expanded by default. It includes:

- Heading: `我的风格`
- Primary action: `粘贴代表作生成`
- Conditional action: `一键生成我的风格`, only if an external provider is available
- Helper copy explaining that the saved style will be enabled for this work

When a personal style is already selected, the workbench defaults to a collapsed one-line summary:

```text
正在使用：我的风格：克制产品随笔
```

The collapsed state still offers a way to expand and regenerate or update the style.

### Pasted-Sample Flow

The pasted-sample flow opens an input area for representative works. It should not enforce a strict minimum count or length. Instead, the UI should gently tell users that more representative samples produce a better style. The server can still return a recoverable "need more samples" error if the input is empty or clearly insufficient.

After generation, show an editable review form with:

- Skill title
- Description
- Prompt
- Save mode: update an existing personal style or create a new version

The initial title should use:

```text
我的风格：<AI-generated short name>
```

### External One-Click Flow

If an external provider is configured, the workbench shows `一键生成我的风格`. Clicking it asks the server to call the provider for the current logged-in user. The user does not paste samples in this path.

The external provider returns a ready-to-review skill draft. The UI then uses the same editable review form and save behavior as the pasted-sample flow.

### Save Behavior

Saving has two modes:

- `更新已有风格`: update a selected user-owned personal style skill.
- `创建新版本`: create a new user skill.

The feature must never silently overwrite an existing personal style. If the user has one or more personal style skills, the review form should make the save mode explicit.

After a successful save:

- The saved skill id is added to the Seed screen's selected skill ids.
- The user remains on the Seed screen.
- The workbench collapses to show the selected personal style.
- Starting the work sends the enabled skill ids to the existing session start flow.

## Skill Shape

Generated personal styles use the existing skill schema:

- `title`: `我的风格：<short name>`
- `category`: `风格`
- `description`: a concise user-facing summary
- `prompt`: the full style instruction used by writing generation
- `appliesTo`: `writer`
- `defaultEnabled`: `false`
- `isArchived`: `false`

The feature should not add a source or metadata column. Existing and newly generated personal style skills are identified in the workbench by convention:

- user-owned skill
- `isSystem = false`
- `category = 风格`
- title starts with `我的风格：`

Other style skills remain available through the normal skill picker, but the `我的风格` workbench does not treat them as update targets unless they follow this convention.

## API Design

Add generation endpoints that return skill drafts but do not save:

### `GET /api/skills/style/config`

Returns feature availability for the current user:

```json
{
  "externalStyleGenerationAvailable": true
}
```

This endpoint can be folded into `GET /api/skills` if implementation prefers fewer requests. The important behavior is that the client can decide whether to show `一键生成我的风格` without probing a failing generation endpoint.

### `POST /api/skills/style/generate-from-samples`

Requires the current logged-in user. Accepts:

```json
{
  "samples": ["sample text"]
}
```

Returns:

```json
{
  "skillDraft": {
    "title": "我的风格：克制产品随笔",
    "category": "风格",
    "description": "偏克制、具体、短句的产品随笔表达。",
    "prompt": "...",
    "appliesTo": "writer",
    "defaultEnabled": false,
    "isArchived": false
  }
}
```

The endpoint validates the returned draft with `SkillUpsertSchema`. It does not persist anything.

### `POST /api/skills/style/generate-external`

Requires the current logged-in user. It sends only current-user identity to the configured external provider, such as:

```json
{
  "user": {
    "id": "user-1",
    "username": "alice",
    "displayName": "Alice"
  }
}
```

The external provider maps that identity to its own style-generation capability and returns a ready skill draft. Tritree validates it with `SkillUpsertSchema` and returns it to the client. It does not persist anything.

If no external provider is configured, this endpoint returns a clear unavailable response and the UI should not normally show the action.

### Existing Save APIs

Final persistence reuses:

- `POST /api/skills` for creating a new style skill.
- `PATCH /api/skills/:skillId` for updating an existing user style skill.
- Existing Seed screen selected skill state for enabling the saved skill before session start.

No new endpoint is needed for session enablement before the work starts. During an existing session, the existing session skills endpoint can continue to handle enabled skill replacement.

## Service Design

Add a small style generation service layer so components and route handlers do not care where the draft came from.

Recommended module responsibilities:

- `isExternalStyleProviderAvailable()`
- `generateStyleFromSamples(userId, samples)`
- `generateStyleFromExternal(user)`
- `normalizeGeneratedStyleDraft(raw)`

`normalizeGeneratedStyleDraft` should:

- trim strings
- ensure `category = 风格`
- ensure `appliesTo = writer`
- ensure `defaultEnabled = false`
- ensure `isArchived = false`
- enforce the `我的风格：` title prefix
- validate through `SkillUpsertSchema`

The external provider adapter can be configured by environment variables or a local provider module. The design should not hard-code a final authentication protocol. A simple HTTP implementation may support URL and token configuration first, but the provider boundary should leave room for HMAC or other deployment-specific authentication later.

## Internal AI Prompting

The internal sample-generation path should ask the model to infer reusable style instructions from representative writing. It should not summarize the samples' topics as the user's permanent interests.

The generated prompt should focus on durable expression habits, such as:

- sentence rhythm
- level of detail
- tone and emotional temperature
- relationship to the reader
- preferred structure
- recurring constraints
- things to avoid

It should avoid overfitting to a single sample, copying long passages, or preserving private content. User-facing output must remain in Simplified Chinese unless the user's style explicitly requires otherwise.

If samples are too sparse or not representative enough, the internal path should return a recoverable error asking for more examples instead of inventing a confident style.

## Component Design

Add `StyleProfileSetup` under `src/components/skills/` or `src/components/root-memory/`. `RootMemorySetup` owns the final selected skill ids and passes in:

- `skills`
- `selectedSkillIds`
- `onSkillSaved(skill)`
- `disabled`
- external generation availability

`StyleProfileSetup` owns temporary UI state:

- expanded/collapsed state
- pasted sample text
- generation mode in progress
- generated skill draft
- save mode
- selected existing personal style skill id
- generation or save error

`RootMemorySetup` updates `selectedSkillIds` when the child reports a saved skill. If updating an existing enabled skill, the selected ids remain unchanged. If creating a new skill, the new id is added and duplicate old style ids may remain selected unless the user explicitly removes them through the skill picker. A later implementation may choose to replace old personal style ids, but the first version should avoid surprising automatic deselection.

## Error Handling

- Empty sample input returns a friendly validation error before model generation.
- Insufficient samples return a recoverable error and preserve the user's input.
- Model or provider failures preserve the input and any existing draft.
- External provider unavailable means the one-click action is hidden; direct calls return a clear unavailable response.
- External provider bad data returns a validation error without saving.
- Skill save failures keep the review form open and preserve edits.
- The user can retry generation after errors.
- The user can switch to manual creation after errors by editing an empty or partially generated skill draft.

## Accessibility

- The workbench expand/collapse control should be a real button with `aria-expanded`.
- Generation actions should have distinct labels: `粘贴代表作生成` and `一键生成我的风格`.
- The review form should use labeled inputs for title, description, and prompt.
- Save mode should use radio buttons or a segmented control with accessible names.
- Errors should be rendered in an alert region and not rely on color alone.
- Buttons should remain keyboard reachable and disabled while requests are running.

## Testing

Domain and service tests should cover:

- Generated drafts are normalized into `category = 风格`, `appliesTo = writer`, and `defaultEnabled = false`.
- Titles receive the `我的风格：` prefix when missing.
- Invalid generated data is rejected with a clear error.
- Empty and insufficient sample handling.
- External provider availability detection.
- External provider success, unavailable, timeout, unauthorized, server error, and bad-schema responses.

API route tests should cover:

- Both generation endpoints require login.
- Generation endpoints only use the current user and never accept a target `userId`.
- `generate-from-samples` returns a skill draft and does not persist it.
- `generate-external` returns a skill draft when configured and unavailable when not configured.
- Bad provider data returns an error and does not persist anything.

Repository and API save tests should reuse or extend existing skill tests:

- Creating a generated style skill creates a user-owned skill.
- Updating an existing personal style only works for the owning user.
- System skills cannot be updated through the review flow.
- Saved style skills can be selected in the Seed screen and passed to session start.

Component tests should cover:

- No personal style selected renders the workbench expanded.
- Existing selected personal style renders the workbench collapsed.
- Configured external provider shows `一键生成我的风格`; unconfigured provider hides it.
- Pasted-sample generation displays an editable skill review form.
- External generation displays the same editable review form.
- Saving a new style adds the returned skill id to selected skill ids.
- Updating an existing style preserves selection.
- Generation failure preserves sample input and shows retry plus manual creation.

## Rollout Notes

This feature can ship incrementally:

1. Add the style generation service and sample-generation endpoint.
2. Add `StyleProfileSetup` with the pasted-sample path.
3. Add external provider availability and one-click generation.
4. Add the update-existing versus create-new save mode.

The first usable slice is the open-source path: paste samples, generate an editable style skill, save it, and auto-enable it for the current work.
