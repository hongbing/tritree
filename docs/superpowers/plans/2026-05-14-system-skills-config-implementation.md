# System Skills Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load all Tritree system skill definitions from JSON config instead of hardcoding them in TypeScript.

**Architecture:** Add a focused `src/lib/system-skills.ts` loader that resolves `.tritree/system-skills.json` or `TRITREE_SYSTEM_SKILLS_CONFIG_PATH`, parses and validates JSON, and returns typed system skill definitions. Wire the repository seed step to this loader, upsert configured system skills, and archive global system skills no longer present in config. Move the current two visible system skills to a checked-in example config and document how self-hosted users enable it.

**Tech Stack:** TypeScript, Node.js `fs` and `path`, Zod, SQLite `node:sqlite`, Vitest.

---

## File Structure

- Create `src/lib/system-skills.ts`: path resolution, config reading, JSON parsing, schema validation, duplicate id detection, and exported constants/types.
- Create `src/lib/system-skills.test.ts`: focused loader tests with fake file readers and temporary config files.
- Create `config/system-skills.example.json`: example deployable config containing the current `system-writer` and `system-reviewer` definitions.
- Modify `src/lib/domain.ts`: remove `DEFAULT_SYSTEM_SKILLS`; keep `SkillUpsertSchema`, `MERGED_SYSTEM_SKILL_IDS`, and `LEGACY_SYSTEM_SKILL_IDS`.
- Modify `src/lib/domain.test.ts`: remove tests that assert hardcoded system skill content; keep schema and skill routing tests.
- Modify `src/lib/db/repository.ts`: load configured system skills in the repository constructor, seed from config, and archive removed global system skills.
- Modify `src/lib/db/repository.test.ts`: make normal repository tests use the example config; add config-driven seed/update/archive tests.
- Modify `.env.example`: document `TRITREE_SYSTEM_SKILLS_CONFIG_PATH`.
- Modify `README.md`: document default path, setup copy command, env override, and failure behavior.

---

### Task 1: Add Loader Tests

**Files:**
- Create: `src/lib/system-skills.test.ts`

- [ ] **Step 1: Write failing loader tests**

Create `src/lib/system-skills.test.ts` with:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_SKILLS_CONFIG_PATH_ENV,
  defaultSystemSkillsConfigPath,
  loadConfiguredSystemSkills,
  resolveSystemSkillsConfigPath
} from "./system-skills";

const validConfig = JSON.stringify({
  systemSkills: [
    {
      id: "system-writer",
      title: "系统写作者",
      category: "风格",
      description: "负责生成草稿。",
      prompt: "写出下一版草稿。",
      appliesTo: "writer",
      defaultEnabled: true,
      isArchived: false
    },
    {
      id: "system-reviewer",
      title: "系统审核者",
      category: "检查",
      description: "负责提出下一步问题。",
      prompt: "提出一个问题和三个答案。",
      appliesTo: "editor",
      defaultEnabled: true,
      isArchived: false
    }
  ]
});

describe("system skill config loader", () => {
  it("resolves the default system skills config path under .tritree", () => {
    expect(defaultSystemSkillsConfigPath("/workspace/tritree")).toBe(
      path.join("/workspace/tritree", ".tritree", "system-skills.json")
    );
    expect(resolveSystemSkillsConfigPath({ cwd: "/workspace/tritree", env: {} })).toBe(
      path.join("/workspace/tritree", ".tritree", "system-skills.json")
    );
  });

  it("uses an absolute TRITREE_SYSTEM_SKILLS_CONFIG_PATH override", () => {
    expect(
      resolveSystemSkillsConfigPath({
        cwd: "/workspace/tritree",
        env: { [SYSTEM_SKILLS_CONFIG_PATH_ENV]: "/secure/system-skills.json" }
      })
    ).toBe("/secure/system-skills.json");
  });

  it("rejects relative TRITREE_SYSTEM_SKILLS_CONFIG_PATH values", () => {
    expect(() =>
      resolveSystemSkillsConfigPath({
        cwd: "/workspace/tritree",
        env: { [SYSTEM_SKILLS_CONFIG_PATH_ENV]: "config/system-skills.json" }
      })
    ).toThrow("TRITREE_SYSTEM_SKILLS_CONFIG_PATH must be an absolute path");
  });

  it("rejects a missing config file", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => false
      })
    ).toThrow("System skills config /workspace/tritree/.tritree/system-skills.json was not found");
  });

  it("rejects invalid JSON without printing prompt content", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => "{ invalid json"
      })
    ).toThrow("is not valid JSON");
  });

  it("requires a non-empty systemSkills array", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => JSON.stringify({})
      })
    ).toThrow("systemSkills must be a non-empty array");

    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => JSON.stringify({ systemSkills: [] })
      })
    ).toThrow("systemSkills must be a non-empty array");
  });

  it("rejects duplicate system skill ids", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () =>
          JSON.stringify({
            systemSkills: [
              {
                id: "system-writer",
                title: "系统写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer",
                defaultEnabled: true,
                isArchived: false
              },
              {
                id: "system-writer",
                title: "重复写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer",
                defaultEnabled: true,
                isArchived: false
              }
            ]
          })
      })
    ).toThrow("Duplicate system skill id: system-writer");
  });

  it("parses valid skills through SkillUpsertSchema defaults and validation", () => {
    const skills = loadConfiguredSystemSkills({
      configPath: "/workspace/tritree/.tritree/system-skills.json",
      exists: () => true,
      readFile: () => validConfig
    });

    expect(skills).toEqual([
      expect.objectContaining({
        id: "system-writer",
        appliesTo: "writer",
        defaultEnabled: true,
        isArchived: false
      }),
      expect.objectContaining({
        id: "system-reviewer",
        appliesTo: "editor",
        defaultEnabled: true,
        isArchived: false
      })
    ]);
  });
});
```

- [ ] **Step 2: Run loader tests to verify red**

Run:

```bash
npm test -- src/lib/system-skills.test.ts
```

Expected: FAIL because `src/lib/system-skills.ts` does not exist.

---

### Task 2: Implement The System Skill Config Loader

**Files:**
- Create: `src/lib/system-skills.ts`
- Test: `src/lib/system-skills.test.ts`

- [ ] **Step 1: Add the loader implementation**

Create `src/lib/system-skills.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SkillUpsertSchema } from "@/lib/domain";

type StringEnv = Record<string, string | undefined>;

export const SYSTEM_SKILLS_CONFIG_PATH_ENV = "TRITREE_SYSTEM_SKILLS_CONFIG_PATH";

const ConfiguredSystemSkillSchema = SkillUpsertSchema.extend({
  id: z.string().trim().min(1)
});

const SystemSkillsConfigSchema = z.object({
  systemSkills: z.array(ConfiguredSystemSkillSchema).min(1, "systemSkills must be a non-empty array")
});

export type ConfiguredSystemSkill = z.infer<typeof ConfiguredSystemSkillSchema>;

export function defaultSystemSkillsConfigPath(cwd = process.cwd()) {
  return path.join(cwd, ".tritree", "system-skills.json");
}

export function resolveSystemSkillsConfigPath({
  cwd = process.cwd(),
  env = process.env
}: {
  cwd?: string;
  env?: StringEnv;
} = {}) {
  const configuredPath = env[SYSTEM_SKILLS_CONFIG_PATH_ENV]?.trim();
  if (!configuredPath) return defaultSystemSkillsConfigPath(cwd);
  if (!path.isAbsolute(configuredPath)) {
    throw new Error(`${SYSTEM_SKILLS_CONFIG_PATH_ENV} must be an absolute path.`);
  }
  return configuredPath;
}

export function loadConfiguredSystemSkills({
  configPath,
  cwd = process.cwd(),
  env = process.env,
  exists = existsSync,
  readFile = (filePath) => readFileSync(filePath, "utf8")
}: {
  configPath?: string;
  cwd?: string;
  env?: StringEnv;
  exists?: (filePath: string) => boolean;
  readFile?: (filePath: string) => string;
} = {}): ConfiguredSystemSkill[] {
  const resolvedPath = configPath ?? resolveSystemSkillsConfigPath({ cwd, env });
  if (!exists(resolvedPath)) {
    throw new Error(`System skills config ${resolvedPath} was not found.`);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFile(resolvedPath));
  } catch (error) {
    throw new Error(`System skills config ${resolvedPath} is not valid JSON: ${errorMessage(error)}.`);
  }

  const parsed = SystemSkillsConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new Error(`System skills config ${resolvedPath} is invalid: ${formatConfigIssue(parsed.error)}.`);
  }

  const seen = new Set<string>();
  for (const skill of parsed.data.systemSkills) {
    if (seen.has(skill.id)) {
      throw new Error(`Duplicate system skill id: ${skill.id}.`);
    }
    seen.add(skill.id);
  }

  return parsed.data.systemSkills;
}

function formatConfigIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "unknown validation error";
  const location = issue.path.length > 0 ? issue.path.join(".") : "root";
  return `${location}: ${issue.message}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 2: Run loader tests to verify green**

Run:

```bash
npm test -- src/lib/system-skills.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit loader**

Run:

```bash
git add src/lib/system-skills.ts src/lib/system-skills.test.ts
git commit -m "feat: load system skills from config"
```

---

### Task 3: Wire Repository Seeding To Config

**Files:**
- Modify: `src/lib/db/repository.ts`
- Modify: `src/lib/db/repository.test.ts`
- Modify: `src/lib/domain.test.ts`
- Test: `src/lib/db/repository.test.ts`

- [ ] **Step 1: Write failing repository tests for configured system skills**

In `src/lib/db/repository.test.ts`, change the import from Vitest to include `beforeEach`, `afterEach`, and `vi`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

Add imports:

```ts
import { SYSTEM_SKILLS_CONFIG_PATH_ENV, type ConfiguredSystemSkill } from "@/lib/system-skills";
```

Add these helpers near `testDbPath()`:

```ts
const exampleSystemSkillsConfigPath = path.resolve("config/system-skills.example.json");

const repositorySystemSkills: ConfiguredSystemSkill[] = [
  {
    id: "system-writer",
    title: "系统写作者",
    category: "风格",
    description: "负责生成和改写草稿，控制改动幅度并保留创作者原意。",
    prompt: "你是写作者。负责把 seed、当前草稿、用户选择和已启用技能写成下一版草稿。",
    appliesTo: "writer",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-reviewer",
    title: "系统审核者",
    category: "检查",
    description: "负责诊断主线、读者、逻辑和发布前风险，并提出下一步选择。",
    prompt: "你是审核者。负责判断当前作品最需要创作者澄清、选择或推进什么。",
    appliesTo: "editor",
    defaultEnabled: true,
    isArchived: false
  }
];

function writeSystemSkillConfig(skills: ConfiguredSystemSkill[]) {
  const root = mkdtempSync(path.join(tmpdir(), "tritree-system-skills-"));
  const configPath = path.join(root, "system-skills.json");
  writeFileSync(configPath, JSON.stringify({ systemSkills: skills }, null, 2));
  return configPath;
}
```

Add this setup inside `describe("Treeable repository", () => {` before the first test:

```ts
  beforeEach(() => {
    vi.stubEnv(SYSTEM_SKILLS_CONFIG_PATH_ENV, exampleSystemSkillsConfigPath);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
```

Replace the existing `"hides merged system skills from the visible skill list"` test with:

```ts
  it("seeds system skills from the configured file", async () => {
    const repo = createTreeableRepository(testDbPath());
    const user = await createTestUser(repo, "writer");

    expect(repo.listSkills(user.id).filter((skill) => skill.isSystem).map((skill) => skill.id)).toEqual([
      "system-reviewer",
      "system-writer"
    ]);
    expect(repo.defaultEnabledSkillIds()).toEqual(["system-reviewer", "system-writer"]);
  });
```

Add these tests after `"seeds system skills idempotently"`:

```ts
  it("updates configured system skills when the config file changes", async () => {
    const dbPath = testDbPath();
    const configPath = writeSystemSkillConfig(repositorySystemSkills);
    const first = createTreeableRepository(dbPath, { systemSkillConfigPath: configPath });
    const user = await createTestUser(first, "writer");

    expect(first.listSkills(user.id).find((skill) => skill.id === "system-writer")?.prompt).toContain("seed");

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          systemSkills: [
            {
              ...repositorySystemSkills[0],
              title: "配置写作者",
              prompt: "配置文件里的新版写作者提示词。",
              defaultEnabled: false
            },
            repositorySystemSkills[1]
          ]
        },
        null,
        2
      )
    );

    const reopened = createTreeableRepository(dbPath, { systemSkillConfigPath: configPath });
    const updated = reopened.listSkills(user.id).find((skill) => skill.id === "system-writer");

    expect(updated).toEqual(expect.objectContaining({
      title: "配置写作者",
      prompt: "配置文件里的新版写作者提示词。",
      defaultEnabled: false
    }));
    expect(reopened.defaultEnabledSkillIds()).toEqual(["system-reviewer"]);
  });

  it("archives global system skills that were removed from config", async () => {
    const dbPath = testDbPath();
    const configPath = writeSystemSkillConfig(repositorySystemSkills);
    const first = createTreeableRepository(dbPath, { systemSkillConfigPath: configPath });
    const user = await createTestUser(first, "writer");

    expect(first.listSkills(user.id).map((skill) => skill.id)).toContain("system-writer");

    writeFileSync(
      configPath,
      JSON.stringify({ systemSkills: [repositorySystemSkills[1]] }, null, 2)
    );

    const reopened = createTreeableRepository(dbPath, { systemSkillConfigPath: configPath });

    expect(reopened.listSkills(user.id).map((skill) => skill.id)).not.toContain("system-writer");
    expect(reopened.listSkills(user.id, { includeArchived: true }).find((skill) => skill.id === "system-writer")?.isArchived).toBe(true);
    expect(reopened.defaultEnabledSkillIds()).toEqual(["system-reviewer"]);
  });
```

In `"backfills merged system skills for sessions that referenced legacy system skills"`, before inserting into `session_enabled_skills`, insert the legacy system skill row so the foreign key exists:

```ts
    sqlite
      .prepare(
        `
          INSERT INTO skills (id, title, category, description, prompt, applies_to, is_system, default_enabled, is_archived, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
        `
      )
      .run(
        "system-analysis",
        "理清主线",
        "方向",
        "旧系统技能。",
        "判断作品真正要表达什么。",
        "editor",
        "2026-05-01T00:00:00.000Z",
        "2026-05-01T00:00:00.000Z"
      );
```

In `"persists skill applicability for system and user skills"`, replace the legacy system assertion with:

```ts
    const reviewerSkill = repo.listSkills(user.id).find((skill) => skill.id === "system-reviewer");
    expect(reviewerSkill?.appliesTo).toBe("editor");
```

In `"rejects direct edits to system skills"`, change `"system-analysis"` to `"system-writer"`.

In `src/lib/domain.test.ts`, remove the import of `DEFAULT_SYSTEM_SKILLS` and delete these tests:

```ts
  it("assigns the merged system skills to writing and review effect groups", () => {
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-writer")?.appliesTo).toBe("writer");
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-reviewer")?.appliesTo).toBe("editor");
  });
```

```ts
  it("ships only the merged writer and reviewer skills as default enabled system skills", () => {
    expect(DEFAULT_SYSTEM_SKILLS.filter((skill) => !skill.isArchived).map((skill) => skill.id)).toEqual([
      "system-writer",
      "system-reviewer"
    ]);
    expect(DEFAULT_SYSTEM_SKILLS.filter((skill) => skill.defaultEnabled).map((skill) => skill.id)).toEqual([
      "system-writer",
      "system-reviewer"
    ]);

    const archivedLegacySkills = DEFAULT_SYSTEM_SKILLS.filter((skill) =>
      [
        "system-content-workflow",
        "system-analysis",
        "system-expand",
        "system-rewrite",
        "system-polish",
        "system-correct",
        "system-style-shift",
        "system-compress",
        "system-restructure",
        "system-audience",
        "system-logic-review",
        "system-reader-entry",
        "system-final-pass",
        "system-concrete-examples",
        "system-no-hype-title",
        "system-claim-risk",
        "system-title-opening-promise",
        "system-natural-short-sentences"
      ].includes(skill.id)
    ).map((skill) => ({ id: skill.id, defaultEnabled: skill.defaultEnabled, isArchived: skill.isArchived }));

    expect(archivedLegacySkills).toHaveLength(18);
    expect(archivedLegacySkills).toEqual(expect.arrayContaining([
      { id: "system-content-workflow", defaultEnabled: false, isArchived: true },
      { id: "system-analysis", defaultEnabled: false, isArchived: true },
      { id: "system-expand", defaultEnabled: false, isArchived: true },
      { id: "system-rewrite", defaultEnabled: false, isArchived: true },
      { id: "system-polish", defaultEnabled: false, isArchived: true },
      { id: "system-correct", defaultEnabled: false, isArchived: true },
      { id: "system-style-shift", defaultEnabled: false, isArchived: true },
      { id: "system-compress", defaultEnabled: false, isArchived: true },
      { id: "system-restructure", defaultEnabled: false, isArchived: true },
      { id: "system-audience", defaultEnabled: false, isArchived: true },
      { id: "system-logic-review", defaultEnabled: false, isArchived: true },
      { id: "system-reader-entry", defaultEnabled: false, isArchived: true },
      { id: "system-final-pass", defaultEnabled: false, isArchived: true },
      { id: "system-concrete-examples", defaultEnabled: false, isArchived: true },
      { id: "system-no-hype-title", defaultEnabled: false, isArchived: true },
      { id: "system-claim-risk", defaultEnabled: false, isArchived: true },
      { id: "system-title-opening-promise", defaultEnabled: false, isArchived: true },
      { id: "system-natural-short-sentences", defaultEnabled: false, isArchived: true }
    ]));
  });
```

```ts
  it("keeps merged system prompts as creator decision guidance", () => {
    const writer = DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-writer");
    const reviewer = DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-reviewer");

    expect(writer?.prompt).toContain("写作者");
    expect(writer?.prompt).toContain("种子或零散想法");
    expect(writer?.prompt).toContain("组织材料");
    expect(writer?.prompt).toContain("自然、清楚");
    expect(writer?.prompt).toContain("保留用户已经确认过的表达");

    expect(reviewer?.prompt).toContain("审核者");
    expect(reviewer?.prompt).toContain("一个问题和三个答案");
    expect(reviewer?.prompt).toContain("主线");
    expect(reviewer?.prompt).toContain("读者");
    expect(reviewer?.prompt).toContain("逻辑断点");
    expect(reviewer?.prompt).toContain("发布前");
  });
```

```ts
  it("keeps every default system skill valid for runtime parsing", () => {
    DEFAULT_SYSTEM_SKILLS.forEach((skill) => {
      expect(() => SkillUpsertSchema.parse(skill)).not.toThrow();
    });
  });
```

- [ ] **Step 2: Run repository tests to verify red**

Run:

```bash
npm test -- src/lib/db/repository.test.ts src/lib/domain.test.ts
```

Expected: FAIL because `config/system-skills.example.json` does not exist and `createTreeableRepository()` does not accept or load `systemSkillConfigPath`.

- [ ] **Step 3: Implement repository config seeding**

In `src/lib/db/repository.ts`, replace the `DEFAULT_SYSTEM_SKILLS` import with:

```ts
import { loadConfiguredSystemSkills, type ConfiguredSystemSkill } from "@/lib/system-skills";
```

Change the repository constructor signature to:

```ts
export function createTreeableRepository(
  dbPath = defaultDbPath(),
  {
    skillInstallRoot = defaultSkillInstallRoot(),
    systemSkillConfigPath
  }: {
    skillInstallRoot?: string;
    systemSkillConfigPath?: string;
  } = {}
) {
```

Load configured skills before seeding:

```ts
  const db = createDatabase(dbPath);
  const configuredSystemSkills = loadConfiguredSystemSkills({ configPath: systemSkillConfigPath });
  cleanupStoredSkillRuntimePrompts();
  ensureSystemSkills(configuredSystemSkills);
  backfillMergedSystemSkillsForLegacySessions();
  ensureDefaultCreationRequestOptions();
```

Replace `ensureSystemSkills()` with:

```ts
  function ensureSystemSkills(systemSkills: ConfiguredSystemSkill[]) {
    const timestamp = now();
    for (const skill of systemSkills) {
      const parsed = SkillUpsertSchema.parse(skill);
      const existing = db.prepare("SELECT id FROM skills WHERE id = ?").get(skill.id);
      if (existing) {
        db.prepare(
          `
            UPDATE skills
            SET user_id = NULL, title = ?, category = ?, description = ?, prompt = ?, applies_to = ?, is_system = 1, default_enabled = ?, is_archived = ?, updated_at = ?
            WHERE id = ?
          `
        ).run(
          parsed.title,
          parsed.category,
          parsed.description,
          parsed.prompt,
          parsed.appliesTo,
          parsed.defaultEnabled ? 1 : 0,
          parsed.isArchived ? 1 : 0,
          timestamp,
          skill.id
        );
      } else {
        db.prepare(
          `
            INSERT INTO skills (id, title, category, description, prompt, applies_to, is_system, default_enabled, is_archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
          `
        ).run(
          skill.id,
          parsed.title,
          parsed.category,
          parsed.description,
          parsed.prompt,
          parsed.appliesTo,
          parsed.defaultEnabled ? 1 : 0,
          parsed.isArchived ? 1 : 0,
          timestamp,
          timestamp
        );
      }
    }

    const configuredIds = systemSkills.map((skill) => skill.id);
    const placeholders = configuredIds.map(() => "?").join(", ");
    db.prepare(
      `
        UPDATE skills
        SET is_archived = 1, updated_at = ?
        WHERE user_id IS NULL
          AND is_system = 1
          AND id NOT IN (${placeholders})
      `
    ).run(timestamp, ...configuredIds);
  }
```

In `src/lib/domain.ts`, delete the entire `DEFAULT_SYSTEM_SKILLS` array export. Keep `MERGED_SYSTEM_SKILL_IDS`, `LEGACY_SYSTEM_SKILL_IDS`, and all schemas/types.

- [ ] **Step 4: Run repository tests to verify current failures are only missing example config**

Run:

```bash
npm test -- src/lib/db/repository.test.ts src/lib/domain.test.ts
```

Expected: FAIL because `config/system-skills.example.json` is missing.

---

### Task 4: Add Example System Skills Config

**Files:**
- Create: `config/system-skills.example.json`
- Test: `src/lib/db/repository.test.ts`, `src/lib/domain.test.ts`

- [ ] **Step 1: Add the example config**

Create `config/system-skills.example.json` with:

```json
{
  "systemSkills": [
    {
      "id": "system-writer",
      "title": "系统写作者",
      "category": "风格",
      "description": "负责生成和改写草稿，控制改动幅度并保留创作者原意。",
      "prompt": "你是写作者。负责把 seed、当前草稿、用户选择和已启用技能写成下一版草稿。先判断当前内容所处阶段：种子或零散想法阶段，可以大幅组织材料、补上下文、生成初稿骨架；半成稿阶段，可以补主线、调顺序、增加过渡，但要保留主要素材和语气；结构成稿阶段，优先做局部调整和小范围补齐；基本成稿阶段，保留原有结构、段落和主要句子，只做必要优化；发布前阶段，只做标题、话题、配图提示、错别字、风险表达、结尾收束等轻量整理。写作时要组织材料、补足原因链路、安排例子和过渡，必要时调整表达角度和读者进入方式。使用自然、清楚、不过度修饰的短句，减少套话、长定语、抽象形容和重复铺垫。当前内容优先，保留用户已经确认过的表达；草稿越完整，改动越克制；只有用户明确要求重构、换角度或大改方向时，才允许明显重写。",
      "appliesTo": "writer",
      "defaultEnabled": true,
      "isArchived": false
    },
    {
      "id": "system-reviewer",
      "title": "系统审核者",
      "category": "检查",
      "description": "负责诊断主线、读者、逻辑和发布前风险，并提出下一步选择。",
      "prompt": "你是审核者。负责判断当前作品最需要创作者澄清、选择或推进什么，并把判断转成一个问题和三个答案。按当前内容的问题程度和后续生成收益排序，不要预设必须询问某一类问题。检查作品真正要表达的主线、写作动机、素材取舍、展开顺序、表达角度、目标读者和读者为什么在意。检查观点、例子、原因和结论之间是否有逻辑断点，例如缺少原因、例子支撑不足、从现象跳到结论或前后判断不一致。检查读者能否快速进入作品：开头是否交代读者处境，第一屏是否让读者知道这件事和自己有什么关系，正文是否有对象感。识别事实不确定、证据不足、过度绝对、承诺过大或容易误导的表达。若主线、结构和关键解释基本成立，优先给标题、开头、结尾、话题、配图提示、错别字、风险表达和小范围节奏调整等发布前收口建议，避免继续给大改、重写或换角度建议。文案表达、断句和分段整理不受发布前阶段限制；如果表达本身已经承载主要信息，只是长段、口语散、层次不清或局部不顺，可以给保留原意的表达优化答案。",
      "appliesTo": "editor",
      "defaultEnabled": true,
      "isArchived": false
    }
  ]
}
```

- [ ] **Step 2: Run repository and domain tests to verify green**

Run:

```bash
npm test -- src/lib/system-skills.test.ts src/lib/db/repository.test.ts src/lib/domain.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit repository wiring and example config**

Run:

```bash
git add src/lib/db/repository.ts src/lib/db/repository.test.ts src/lib/domain.ts src/lib/domain.test.ts config/system-skills.example.json
git commit -m "feat: seed system skills from config"
```

---

### Task 5: Document System Skill Config

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Append this line after `TRITREE_SKILL_EXECUTION_MODE=auto`:

```env
# TRITREE_SYSTEM_SKILLS_CONFIG_PATH=/absolute/path/to/system-skills.json
```

- [ ] **Step 2: Update README setup instructions**

In `README.md`, after the `.env.local` example block, add:

````md
复制系统技能配置：

```bash
mkdir -p .tritree
cp config/system-skills.example.json .tritree/system-skills.json
```
````

In the self-hosting section, add:

```md
系统默认 Skills 完全来自配置文件。默认读取 `.tritree/system-skills.json`；也可以用 `TRITREE_SYSTEM_SKILLS_CONFIG_PATH=/absolute/path/to/system-skills.json` 指向其他 JSON 文件。配置缺失、JSON 无效、`systemSkills` 为空或技能字段不合法时，服务会在启动时直接报错，避免静默使用旧提示词。
```

- [ ] **Step 3: Run documentation-adjacent checks**

Run:

```bash
npm test -- src/lib/system-skills.test.ts src/lib/db/repository.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add .env.example README.md
git commit -m "docs: document system skill config"
```

---

### Task 6: Full Verification

**Files:**
- No file edits.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/lib/system-skills.test.ts src/lib/db/repository.test.ts src/lib/domain.test.ts src/app/api/skills/route.test.ts 'src/app/api/sessions/[sessionId]/skills/route.test.ts' src/app/api/sessions/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
git diff --check
```

Expected: `git diff --check` prints no whitespace errors. `git status --short` shows only intended files if commits were not created during execution, or a clean tree if commits were created.

---

## Self-Review

Spec coverage:

- Config file source of truth: Task 2 creates the loader, Task 3 wires repository seeding to it.
- Default path and environment override: Task 1 tests both, Task 2 implements both, Task 5 documents both.
- Startup errors for missing or invalid config: Task 1 tests missing, invalid JSON, empty arrays, duplicates, and schema errors through Zod; Task 2 implements startup throws.
- Upsert configured skills: Task 3 updates `ensureSystemSkills()`.
- Archive removed system skills: Task 3 adds a repository test and archive query.
- Move hardcoded content out of `domain.ts`: Task 3 removes `DEFAULT_SYSTEM_SKILLS`; Task 4 adds example config.
- Legacy compatibility: Task 3 keeps legacy constants and updates the backfill test with an explicit old row.
- Docs: Task 5 covers `.env.example` and README.

Marker scan:

- The plan contains no unresolved marker names, no unresolved optional branches, and no vague validation steps without concrete code.

Type consistency:

- Loader exports `ConfiguredSystemSkill`, `SYSTEM_SKILLS_CONFIG_PATH_ENV`, `defaultSystemSkillsConfigPath()`, `resolveSystemSkillsConfigPath()`, and `loadConfiguredSystemSkills()`.
- Repository constructor accepts `systemSkillConfigPath?: string`, matching tests and loader.
- Config entries use existing `SkillUpsertSchema` fields: `title`, `category`, `description`, `prompt`, `appliesTo`, `defaultEnabled`, and `isArchived`.
