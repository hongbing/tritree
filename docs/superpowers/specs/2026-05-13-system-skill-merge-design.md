# System Skill Merge Design

## Goal

Tritree should ship with only two visible, default-enabled system skills:

- `系统写作者`: responsible for draft generation behavior.
- `系统审核者`: responsible for option and review behavior.

The change should make the built-in skill list easier to understand while preserving the guidance currently spread across the default system skills.

## Current State

System skills are seeded from `DEFAULT_SYSTEM_SKILLS` in `src/lib/domain.ts`. The repository upserts those records on startup, and visible skill lists hide archived skills. New sessions default to non-archived system skills with `defaultEnabled = true`.

The current default-enabled set is too granular. It includes separate skills for workflow, mainline analysis, material organization, angle choice, reader focus, logic review, reader entry, publish preparation, and final pass. Some older merged skills are already archived, which gives this change an existing migration pattern.

## Design

### System Skills

`系统写作者` applies to `writer`. It controls how the AI writes or rewrites the draft. Its prompt should combine:

- Stage-aware change intensity from `内容创作流程`.
- Material organization from `组织素材`.
- Angle and reader awareness when they affect the draft.
- Natural, clear expression guidance from the existing writing-style skill.
- Preservation of user intent and confirmed wording.

`系统审核者` applies to `editor`. It controls how the AI diagnoses the current work and proposes the next question with three answers. Its prompt should combine:

- Stage-aware diagnosis from `内容创作流程`.
- Mainline, material, angle, and reader checks.
- Logic-chain review.
- Reader-entry review.
- Title/opening/publishing readiness and final-pass behavior.
- Risk-aware advice when assertions are too broad or unsupported.

Both new skills should be system skills, visible, default-enabled, and non-archived.

### Legacy Skills

Existing granular system skill ids should remain in the seed list, but become archived and not default-enabled. This avoids deleting historical references or database rows while removing them from normal pickers and new-session defaults.

The legacy ids include:

- `system-content-workflow`
- `system-analysis`
- `system-expand`
- `system-rewrite`
- `system-polish`
- `system-correct`
- `system-logic-review`
- `system-reader-entry`
- `system-final-pass`

Existing archived or optional system skills should stay archived or optional unless their guidance is folded into the two new prompts.

### Data Flow

No schema changes are needed.

On repository startup, `ensureSystemSkills()` upserts the revised `DEFAULT_SYSTEM_SKILLS`. Existing local databases will receive the new two visible skills and archived legacy skills. New sessions will call `defaultEnabledSkillIds()` and receive only the two new skill ids.

Because archived skills are filtered out of active runtime context, startup should also run an additive compatibility step for existing sessions:

- If a session has any enabled legacy default system skill, ensure `system-writer` is enabled for that session.
- If a session has any enabled legacy default system skill, ensure `system-reviewer` is enabled for that session.
- Leave the old session-skill rows in place so history remains inspectable and no destructive migration is required.

Historical sessions then continue to read cleanly and retain active system guidance through the two merged skills. The archived legacy records remain inspectable through `includeArchived`.

### UI Behavior

The seed screen and skill picker should show two selected system skills by default:

- `系统写作者` in the writing group.
- `系统审核者` in the review group.

The skill library should no longer show the old granular skills in the normal visible list. They remain visible only when archived skills are explicitly included by repository callers.

### Error Handling

No new user-facing errors are required. Existing protections remain:

- System skills cannot be directly edited.
- Archived skills are not resolved into active session skill context.
- Missing skill ids are ignored during resolution.

### Testing

Update domain tests to assert:

- The two new system skills are the only default-enabled system skills.
- Their `appliesTo` values are `writer` and `editor`.
- Their prompts preserve the important guidance from the merged skills.
- Legacy granular skills are archived and not default-enabled.

Update repository tests to assert:

- `defaultEnabledSkillIds()` returns only the two new ids.
- Legacy granular skills are hidden from the visible list and still present with `includeArchived`.
- Existing sessions that referenced legacy default system skills are additively backfilled with the two merged skill ids.
- System skill seeding remains idempotent.

Existing prompt and UI tests should continue to work with fixture-level skill ids unless they specifically assert the global default system skill list.

## Out Of Scope

- Changing the skill database schema.
- Deleting or rewriting historical session enabled-skill rows.
- Removing user-created or imported skills.
- Changing how custom skills are created, imported, archived, or applied.
