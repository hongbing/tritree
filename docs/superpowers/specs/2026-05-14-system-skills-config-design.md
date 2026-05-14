# System Skills Config Design

## Goal

Tritree should load all system skill definitions from a configuration file instead of hardcoding them in application source. Self-hosted users should be able to replace the built-in writer and reviewer behavior by editing config, without changing TypeScript code or rebuilding a fork.

## Current State

System skills are currently defined in `DEFAULT_SYSTEM_SKILLS` in `src/lib/domain.ts`. On repository startup, `ensureSystemSkills()` upserts those hardcoded records into the `skills` table. New sessions call `defaultEnabledSkillIds()` and receive visible system skills where `defaultEnabled = true`.

This makes system behavior hard to customize. A user can create normal custom skills, but cannot fully replace system skill definitions without editing source.

## Config File

System skills will be defined by JSON:

```json
{
  "systemSkills": [
    {
      "id": "system-writer",
      "title": "系统写作者",
      "category": "风格",
      "description": "负责生成和改写草稿。",
      "prompt": "完整系统提示词……",
      "appliesTo": "writer",
      "defaultEnabled": true,
      "isArchived": false
    }
  ]
}
```

The default path is `.tritree/system-skills.json`. `TRITREE_SYSTEM_SKILLS_CONFIG_PATH` can point to an alternate absolute file path for deployments that mount config outside the app directory.

Each item must include an `id` and the existing skill upsert fields. The loader will validate entries with `SkillUpsertSchema`, so category, applicability, prompt length, default-enabled state, and archived state keep the same rules as existing skills. Skill ids must be unique.

## Behavior

Startup reads the config file and uses it as the complete source of system skill definitions.

If the file is missing, invalid JSON, missing `systemSkills`, contains no skills, contains duplicate ids, or contains invalid skill objects, repository creation fails with a clear error. There is no fallback to hardcoded system skill prompts, because the requirement is to fully use the configuration file.

`ensureSystemSkills()` will upsert the configured skills as global system skills (`user_id IS NULL`, `is_system = 1`). The visible system skill list and default-enabled session skills will then naturally come from the configured rows.

System skills that existed in the database but are no longer present in the config should be archived during startup. This keeps old session references inspectable while ensuring the current visible system list matches the config file exactly. Existing session reads already ignore archived skills, and missing or archived skill ids are already filtered out of active runtime context.

## Compatibility

`MERGED_SYSTEM_SKILL_IDS` and `LEGACY_SYSTEM_SKILL_IDS` can remain for the existing legacy migration tests and old databases, but the default system skill content should move out of `src/lib/domain.ts`.

The repository constructor should accept an optional `systemSkillConfigPath` for tests, similar to `skillInstallRoot`. Production uses the default path resolver and environment variable.

The app should include a sample checked-in config file, for example `config/system-skills.example.json`, containing the current two system skills. `.env.example` and README should explain how to copy it to `.tritree/system-skills.json` or set `TRITREE_SYSTEM_SKILLS_CONFIG_PATH`.

## Error Handling

Config errors are startup configuration errors. They should include the file path and a concise reason:

- Path override must be absolute.
- Config file could not be read.
- Config file is not valid JSON.
- `systemSkills` must be a non-empty array.
- Duplicate system skill id.
- Invalid system skill field.

The message should avoid printing full prompt contents.

## Testing

Add loader unit tests for:

- Default config path resolution.
- Absolute path override.
- Relative path override rejection.
- Missing config file rejection.
- Invalid JSON rejection.
- Missing or empty `systemSkills` rejection.
- Duplicate id rejection.
- Valid config parsing through `SkillUpsertSchema`.

Update repository tests for:

- System skills are seeded from the config file.
- New sessions default to the configured `defaultEnabled` system skills.
- Reopening the repository updates changed configured skills.
- System skills removed from config are archived and disappear from the visible list.
- Existing legacy backfill behavior still works for old databases.

Update documentation tests only if existing README or environment examples are asserted.

## Out Of Scope

- Editing the system skill config from the web UI.
- Supporting YAML or TOML.
- Merging config with hardcoded defaults.
- Deleting old system skill database rows.
- Changing the custom skill creation/import flow.
