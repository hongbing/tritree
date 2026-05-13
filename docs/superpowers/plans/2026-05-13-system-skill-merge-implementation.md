# System Skill Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tritree's visible built-in system skills with two visible, default-enabled system skills: `系统写作者` and `系统审核者`.

**Architecture:** Keep the existing skill schema and seeding flow. Add two merged system skill ids, archive legacy system skill ids, and add a startup compatibility backfill that enables the merged skills for sessions that previously referenced legacy system skills.

**Tech Stack:** TypeScript, Next.js app code, Vitest, Node SQLite repository tests.

---

## File Structure

- Modify `src/lib/domain.ts`: add merged skill id constants, add two visible default system skills, and archive legacy system skills.
- Modify `src/lib/domain.test.ts`: assert the new two-skill default system model and prompt coverage.
- Modify `src/lib/db/repository.ts`: add startup compatibility backfill after system skill seeding.
- Modify `src/lib/db/repository.test.ts`: update default skill expectations and cover legacy-session backfill.

## Tasks

### Task 1: Lock The New Default Skill Contract

**Files:**
- Modify: `src/lib/domain.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Replace the existing default-system-skill tests with these expectations:

```ts
  it("assigns the merged system skills to writing and review effect groups", () => {
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-writer")?.appliesTo).toBe("writer");
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-reviewer")?.appliesTo).toBe("editor");
  });

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
        "system-concrete-examples",
        "system-no-hype-title",
        "system-logic-review",
        "system-reader-entry",
        "system-claim-risk",
        "system-title-opening-promise",
        "system-final-pass",
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
      { id: "system-concrete-examples", defaultEnabled: false, isArchived: true },
      { id: "system-no-hype-title", defaultEnabled: false, isArchived: true },
      { id: "system-logic-review", defaultEnabled: false, isArchived: true },
      { id: "system-reader-entry", defaultEnabled: false, isArchived: true },
      { id: "system-claim-risk", defaultEnabled: false, isArchived: true },
      { id: "system-title-opening-promise", defaultEnabled: false, isArchived: true },
      { id: "system-final-pass", defaultEnabled: false, isArchived: true },
      { id: "system-natural-short-sentences", defaultEnabled: false, isArchived: true }
    ]));
  });

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

- [ ] **Step 2: Run the domain tests to verify they fail**

Run:

```bash
npm test -- src/lib/domain.test.ts
```

Expected: FAIL because `system-writer` and `system-reviewer` do not exist yet and the old visible system list is still too large.

### Task 2: Define The Two Merged System Skills

**Files:**
- Modify: `src/lib/domain.ts`

- [ ] **Step 1: Add exported merged and legacy id constants**

Add these constants near `MAX_SKILL_PROMPT_LENGTH`:

```ts
export const MERGED_SYSTEM_SKILL_IDS = ["system-writer", "system-reviewer"] as const;
export const LEGACY_SYSTEM_SKILL_IDS = [
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
  "system-concrete-examples",
  "system-no-hype-title",
  "system-logic-review",
  "system-reader-entry",
  "system-claim-risk",
  "system-title-opening-promise",
  "system-final-pass",
  "system-natural-short-sentences"
] as const;
```

- [ ] **Step 2: Replace the first part of `DEFAULT_SYSTEM_SKILLS`**

Make the visible system skill list start with these two default-enabled objects:

```ts
  {
    id: "system-writer",
    title: "系统写作者",
    category: "风格",
    description: "负责生成和改写草稿，控制改动幅度并保留创作者原意。",
    prompt:
      "你是写作者。负责把 seed、当前草稿、用户选择和已启用技能写成下一版草稿。先判断当前内容所处阶段：种子或零散想法阶段，可以大幅组织材料、补上下文、生成初稿骨架；半成稿阶段，可以补主线、调顺序、增加过渡，但要保留主要素材和语气；结构成稿阶段，优先做局部调整和小范围补齐；基本成稿阶段，保留原有结构、段落和主要句子，只做必要优化；发布前阶段，只做标题、话题、配图提示、错别字、风险表达、结尾收束等轻量整理。写作时要组织材料、补足原因链路、安排例子和过渡，必要时调整表达角度和读者进入方式。使用自然、清楚、不过度修饰的短句，减少套话、长定语、抽象形容和重复铺垫。当前内容优先，保留用户已经确认过的表达；草稿越完整，改动越克制；只有用户明确要求重构、换角度或大改方向时，才允许明显重写。",
    appliesTo: "writer",
    defaultEnabled: true
  },
  {
    id: "system-reviewer",
    title: "系统审核者",
    category: "检查",
    description: "负责诊断主线、读者、逻辑和发布前风险，并提出下一步选择。",
    prompt:
      "你是审核者。负责判断当前作品最需要创作者澄清、选择或推进什么，并把判断转成一个问题和三个答案。按当前内容的问题程度和后续生成收益排序，不要预设必须询问某一类问题。检查作品真正要表达的主线、写作动机、素材取舍、展开顺序、表达角度、目标读者和读者为什么在意。检查观点、例子、原因和结论之间是否有逻辑断点，例如缺少原因、例子支撑不足、从现象跳到结论或前后判断不一致。检查读者能否快速进入作品：开头是否交代读者处境，第一屏是否让读者知道这件事和自己有什么关系，正文是否有对象感。识别事实不确定、证据不足、过度绝对、承诺过大或容易误导的表达。若主线、结构和关键解释基本成立，优先给标题、开头、结尾、话题、配图提示、错别字、风险表达和小范围节奏调整等发布前收口建议，避免继续给大改、重写或换角度建议。文案表达、断句和分段整理不受发布前阶段限制；如果表达本身已经承载主要信息，只是长段、口语散、层次不清或局部不顺，可以给保留原意的表达优化答案。",
    appliesTo: "editor",
    defaultEnabled: true
  },
```

- [ ] **Step 3: Archive the legacy system skills**

For each id in `LEGACY_SYSTEM_SKILL_IDS`, set:

```ts
    defaultEnabled: false,
    isArchived: true
```

Keep their prompts present in the array so old database rows are still upserted and inspectable.

- [ ] **Step 4: Run the domain tests to verify they pass**

Run:

```bash
npm test -- src/lib/domain.test.ts
```

Expected: PASS.

### Task 3: Lock Repository Defaults And Legacy Backfill

**Files:**
- Modify: `src/lib/db/repository.test.ts`

- [ ] **Step 1: Update default enabled skill expectations**

In `seeds system skills idempotently`, expect `system-writer` to be default-enabled:

```ts
    expect(secondSkills.find((skill) => skill.id === "system-writer")?.defaultEnabled).toBe(true);
```

In `hides merged system skills from the visible skill list`, replace the default list assertion with:

```ts
    expect(repo.listSkills(user.id).map((skill) => skill.id)).not.toContain("system-analysis");
    expect(repo.listSkills(user.id, { includeArchived: true }).find((skill) => skill.id === "system-analysis")?.isArchived).toBe(true);
    expect(repo.defaultEnabledSkillIds()).toEqual(["system-reviewer", "system-writer"]);
```

In `creates a session with default enabled skills`, replace the assertions with:

```ts
    expect(state.enabledSkillIds).toEqual(["system-reviewer", "system-writer"]);
    expect(state.enabledSkillIds).not.toContain("system-concrete-examples");
    expect(state.enabledSkills!.map((skill) => skill.id)).toEqual(["system-reviewer", "system-writer"]);
```

In `ignores archived system skills when reading session skills`, pass `enabledSkillIds: ["system-writer", "system-compress"]` and expect:

```ts
    expect(state.enabledSkillIds).toEqual(["system-writer"]);
```

- [ ] **Step 2: Add a failing backfill test**

Add this test near the skill repository tests:

```ts
  it("backfills merged system skills for sessions that referenced legacy system skills", async () => {
    const dbPath = testDbPath();
    const repo = createTreeableRepository(dbPath);
    const user = await createTestUser(repo, "writer");
    const root = repo.saveRootMemory(user.id, {
      seed: "写一篇解释为什么要写作的文章",
      domains: ["创作"],
      tones: ["平静"],
      styles: ["观点型"],
      personas: ["实践者"]
    });

    const state = createSessionDraftWithOptions(repo, {
      userId: user.id,
      rootMemoryId: root.id,
      enabledSkillIds: [],
      output: {
        roundIntent: "Start",
        options: [
          { id: "a", label: "A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "C", description: "C", impact: "C", kind: "reframe" }
        ],
        draft: { title: "Draft", body: "Body", hashtags: [], imagePrompt: "" },
        finishAvailable: false,
        publishPackage: null
      }
    });

    const sqlite = new DatabaseSync(dbPath);
    sqlite
      .prepare("INSERT INTO session_enabled_skills (session_id, skill_id, created_at) VALUES (?, ?, ?)")
      .run(state.session.id, "system-analysis", "2026-05-01T00:00:00.000Z");
    sqlite.close();

    const reopened = createTreeableRepository(dbPath);
    const reopenedState = reopened.getSessionState(user.id, state.session.id);

    expect(reopenedState?.enabledSkillIds).toEqual(["system-writer", "system-reviewer"]);

    const check = new DatabaseSync(dbPath);
    const rows = check
      .prepare("SELECT skill_id FROM session_enabled_skills WHERE session_id = ? ORDER BY skill_id")
      .all(state.session.id) as Array<{ skill_id: string }>;
    check.close();

    expect(rows.map((row) => row.skill_id)).toEqual(["system-analysis", "system-reviewer", "system-writer"]);
  });
```

- [ ] **Step 3: Run repository tests to verify the new backfill test fails**

Run:

```bash
npm test -- src/lib/db/repository.test.ts
```

Expected: FAIL because repository startup does not backfill `system-writer` and `system-reviewer` yet.

### Task 4: Implement Startup Backfill

**Files:**
- Modify: `src/lib/db/repository.ts`

- [ ] **Step 1: Import merged and legacy id constants**

Extend the domain import with:

```ts
  LEGACY_SYSTEM_SKILL_IDS,
  MERGED_SYSTEM_SKILL_IDS,
```

- [ ] **Step 2: Call backfill after system skill seeding**

In `createTreeableRepository`, call the backfill after `ensureSystemSkills()`:

```ts
  ensureSystemSkills();
  backfillMergedSystemSkillsForLegacySessions();
  ensureDefaultCreationRequestOptions();
```

- [ ] **Step 3: Add the backfill function**

Add this function after `ensureSystemSkills()`:

```ts
  function backfillMergedSystemSkillsForLegacySessions() {
    const legacyPlaceholders = LEGACY_SYSTEM_SKILL_IDS.map(() => "?").join(", ");
    const sessionRows = db
      .prepare(
        `
          SELECT DISTINCT session_id
          FROM session_enabled_skills
          WHERE skill_id IN (${legacyPlaceholders})
        `
      )
      .all(...LEGACY_SYSTEM_SKILL_IDS) as Array<{ session_id: string }>;

    if (sessionRows.length === 0) return;

    const timestamp = now();
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO session_enabled_skills (session_id, skill_id, created_at)
        VALUES (?, ?, ?)
      `
    );

    for (const row of sessionRows) {
      for (const skillId of MERGED_SYSTEM_SKILL_IDS) {
        insert.run(row.session_id, skillId, timestamp);
      }
    }
  }
```

- [ ] **Step 4: Run repository tests to verify they pass**

Run:

```bash
npm test -- src/lib/db/repository.test.ts
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- No production file changes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/lib/domain.test.ts src/lib/db/repository.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

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
