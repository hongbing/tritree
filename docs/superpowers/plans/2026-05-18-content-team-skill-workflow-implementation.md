# Content Team Skill Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden content workflow stage prompt with five visible content-team system Skills: `策划`, `资料员`, `写手`, `审稿`, and `发布编辑`.

**Architecture:** Tritree keeps the existing three-choice loop and Skill plumbing. The default system Skills become the content team, and the options prompt gets only a small "content team lead" instruction that chooses among enabled roles without exposing workflow state. This pass does not preserve compatibility with older local default-skill data; fresh configured defaults are the source of truth.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, SQLite via `node:sqlite`, existing Tritree Skill config and Mastra prompt builders.

---

## File Structure

- Modify `config/defaults.example.json`: replace the two broad default system Skills with five visible content-team roles.
- Modify `src/lib/domain.ts`: remove legacy system-skill migration constants that are no longer needed.
- Modify `src/lib/db/repository.ts`: remove old system-skill session backfill logic.
- Modify `src/lib/defaults.test.ts`: verify the shipped example defaults contain the five content-team roles.
- Modify `src/lib/db/repository.test.ts`: update system skill fixtures and default ordering; delete old migration expectations.
- Delete `src/lib/ai/content-workflow.ts`: remove the hidden stage instruction module.
- Delete `src/lib/ai/content-workflow.test.ts`: remove tests for the hidden stage instruction module.
- Modify `src/lib/ai/mastra-context.ts`: replace `buildContentWorkflowOptionInstructions()` with a small content-team-lead instruction.
- Modify `src/lib/ai/mastra-context.test.ts`: assert the options prompt uses content-team coordination and no longer includes hidden workflow-stage text.
- Modify `src/lib/ai/mastra-executor.test.ts`: assert writer/editor/shared role routing still works with content-team role names.
- Modify `src/components/skills/SkillPicker.tsx`: make visible group labels match role-based Skills instead of "审稿重点".
- Modify `src/components/skills/SkillPicker.test.tsx`: update group label expectations.
- Modify `src/components/skills/SkillLibraryPanel.tsx`: use "选择" copy where the UI means option generation.
- Modify `src/components/skills/SkillLibraryPanel.test.tsx`: update effect label expectations.
- Modify `src/components/root-memory/RootMemorySetup.test.tsx`: update collapsed/expanded Skill group expectations.

---

### Task 1: Seed Content-Team System Skills And Remove Legacy Migration

**Files:**
- Modify: `config/defaults.example.json`
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/db/repository.ts`
- Modify: `src/lib/defaults.test.ts`
- Modify: `src/lib/db/repository.test.ts`

- [ ] **Step 1: Add tests for shipped content-team defaults**

In `src/lib/defaults.test.ts`, add this import:

```ts
import { readFileSync } from "node:fs";
```

Add this constant after `validConfig`:

```ts
const exampleDefaultsPath = path.resolve("config/defaults.example.json");
const contentTeamSkillIds = [
  "system-planner",
  "system-researcher",
  "system-writer",
  "system-reviewer",
  "system-publisher"
] as const;
```

Add this test inside `describe("defaults config loader", () => { ... })` after `parses valid defaults through shared schemas`:

```ts
  it("ships visible content team system skills in the example defaults", () => {
    const defaults = loadConfiguredDefaults({
      configPath: exampleDefaultsPath,
      exists: () => true,
      readFile: (filePath) => readFileSync(filePath, "utf8")
    });

    expect(defaults.systemSkills.map((skill) => skill.id)).toEqual([...contentTeamSkillIds]);
    expect(defaults.systemSkills.map((skill) => skill.title)).toEqual([
      "策划",
      "资料员",
      "写手",
      "审稿",
      "发布编辑"
    ]);
    expect(defaults.systemSkills.map((skill) => skill.appliesTo)).toEqual([
      "editor",
      "editor",
      "writer",
      "editor",
      "both"
    ]);
    expect(defaults.systemSkills.every((skill) => skill.defaultEnabled)).toBe(true);
    expect(defaults.systemSkills.every((skill) => !skill.isArchived)).toBe(true);
    expect(defaults.systemSkills.find((skill) => skill.id === "system-researcher")?.prompt).toContain(
      "不要编造事实"
    );
    expect(defaults.systemSkills.find((skill) => skill.id === "system-publisher")?.prompt).toContain(
      "发布"
    );
  });
```

- [ ] **Step 2: Update repository test fixture to the five content-team roles**

In `src/lib/db/repository.test.ts`, replace `repositorySystemSkills` with:

```ts
const repositorySystemSkills: ConfiguredSystemSkill[] = [
  {
    id: "system-planner",
    title: "策划",
    category: "方向",
    description: "决定内容主题、角度、读者和表达目标。",
    prompt: "你是策划。先判断这篇内容最值得写的中心、角度、读者、冲突或感受。",
    appliesTo: "editor",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-researcher",
    title: "资料员",
    category: "方向",
    description: "补足例子、场景、事实、背景和可用素材。",
    prompt: "你是资料员。负责找到让内容具体可信的素材；不要编造事实。",
    appliesTo: "editor",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-writer",
    title: "写手",
    category: "风格",
    description: "把明确方向和可用素材写成下一版草稿。",
    prompt: "你是写手。负责把 seed、当前草稿、用户选择和已启用技能写成下一版草稿。",
    appliesTo: "writer",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-reviewer",
    title: "审稿",
    category: "检查",
    description: "检查主线、逻辑、可信度、读者进入和表达风险。",
    prompt: "你是审稿。负责判断当前作品最需要创作者澄清、选择或推进什么。",
    appliesTo: "editor",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-publisher",
    title: "发布编辑",
    category: "平台",
    description: "把近成稿收束成可发布版本或平台化交付。",
    prompt: "你是发布编辑。负责标题、开头、结尾、压缩、平台版本和发布前风险表达。",
    appliesTo: "both",
    defaultEnabled: true,
    isArchived: false
  }
];

const expectedContentTeamSkillIds = [
  "system-publisher",
  "system-planner",
  "system-researcher",
  "system-reviewer",
  "system-writer"
] as const;

const repositoryWriterSkill = repositorySystemSkills.find((skill) => skill.id === "system-writer")!;
const repositoryReviewerSkill = repositorySystemSkills.find((skill) => skill.id === "system-reviewer")!;
```

Update existing repository expectations:

```ts
expect(repo.listSkills(second.id).filter((skill) => skill.isSystem).map((skill) => skill.id)).toEqual([
  ...expectedContentTeamSkillIds
]);
```

```ts
expect(repo.listSkills(user.id).filter((skill) => skill.isSystem).map((skill) => skill.id)).toEqual([
  ...expectedContentTeamSkillIds
]);
expect(repo.defaultEnabledSkillIds()).toEqual([...expectedContentTeamSkillIds]);
```

```ts
expect(secondSkills.find((skill) => skill.id === "system-writer")?.defaultEnabled).toBe(true);
expect(secondSkills.find((skill) => skill.id === "system-planner")?.defaultEnabled).toBe(true);
expect(secondSkills.find((skill) => skill.id === "system-publisher")?.defaultEnabled).toBe(true);
```

In `"updates configured system skills when the config file changes"`, replace the `systemSkills` array passed to `JSON.stringify()` with an id-based map so only the writer changes:

```ts
          systemSkills: repositorySystemSkills.map((skill) =>
            skill.id === "system-writer"
              ? {
                  ...repositoryWriterSkill,
                  title: "配置写作者",
                  prompt: "配置文件里的新版写作者提示词。",
                  defaultEnabled: false
                }
              : skill
          ),
```

Then update the default-enabled expectation to include the other active defaults:

```ts
expect(reopened.defaultEnabledSkillIds()).toEqual([
  "system-publisher",
  "system-planner",
  "system-researcher",
  "system-reviewer"
]);
```

In `"archives global system skills that were removed from config"`, keep only reviewer in the config by using `[repositoryReviewerSkill]`, then expect:

```ts
expect(reopened.defaultEnabledSkillIds()).toEqual(["system-reviewer"]);
```

In `"persists skill applicability for system and user skills"`, keep the reviewer assertion and add:

```ts
const plannerSkill = repo.listSkills(user.id).find((skill) => skill.id === "system-planner");
const publisherSkill = repo.listSkills(user.id).find((skill) => skill.id === "system-publisher");
expect(plannerSkill?.appliesTo).toBe("editor");
expect(publisherSkill?.appliesTo).toBe("both");
```

- [ ] **Step 3: Remove legacy migration expectations and update session defaults**

In `src/lib/db/repository.test.ts`, delete these two tests entirely:

- `backfills merged system skills for sessions that referenced legacy system skills`
- `backfills only active configured merged system skills for legacy sessions`

There is no replacement migration test. The product decision is that this pass does not support compatibility with older local default-skill data.

Update session default expectations:

```ts
expect(state.enabledSkillIds).toEqual([...expectedContentTeamSkillIds]);
expect(state.enabledSkillIds).not.toContain("system-concrete-examples");
expect(state.enabledSkills!.map((skill) => skill.id)).toEqual([...expectedContentTeamSkillIds]);
```

Update `"replaces session enabled skills"` title expectation:

```ts
expect(updated?.enabledSkillIds).toEqual(["system-reviewer", "system-writer"]);
expect(updated?.enabledSkills!.map((skill) => skill.title)).toEqual(["审稿", "写手"]);
```

- [ ] **Step 4: Run tests to verify the new expectations fail**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts
```

Expected: FAIL because the example defaults still contain only `system-writer` and `system-reviewer`.

- [ ] **Step 5: Remove legacy migration constants and repository backfill logic**

In `src/lib/domain.ts`, delete both legacy migration constants:

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

In `src/lib/db/repository.ts`, remove these imports:

```ts
  LEGACY_SYSTEM_SKILL_IDS,
  MERGED_SYSTEM_SKILL_IDS,
```

Remove this startup call:

```ts
    backfillMergedSystemSkillsForLegacySessions();
```

Then delete the entire `backfillMergedSystemSkillsForLegacySessions()` function.

- [ ] **Step 6: Replace the example default system Skills with five content-team roles**

In `config/defaults.example.json`, replace the `systemSkills` array with this exact array:

```json
[
  {
    "id": "system-planner",
    "title": "策划",
    "category": "方向",
    "description": "决定内容主题、角度、读者和表达目标。",
    "prompt": "你是策划。负责判断这篇内容最值得写的中心、角度、读者、冲突、感受或主张。把模糊 seed 收成一个当前最有价值的创作问题，再给出三个可选择答案。避免在中心还没成立时直接泛泛扩写。优先帮助用户决定写什么、为什么写、写给谁、从哪里进入。通常不要调用执行助手来替用户决定核心方向；如果主题很宽，可以让执行助手列角度或可能读者，但最终只把最值得选择的三个方向交给用户。",
    "appliesTo": "editor",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-researcher",
    "title": "资料员",
    "category": "方向",
    "description": "补足例子、场景、事实、背景和可用素材。",
    "prompt": "你是资料员。负责发现当前内容缺少哪些真实材料，并把例子、场景、事实、背景、对比、引用、参考和细节组织成可写素材。注意草稿是否太抽象、判断是否缺少依据、例子是否不足以支撑观点。不要编造事实；需要外部信息时，只能使用本轮列出的工具或请用户补充。适合把明确、边界清楚的素材整理任务交给执行助手，例如归类笔记、总结资料、列缺失证据或整理对比例子。",
    "appliesTo": "editor",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-writer",
    "title": "写手",
    "category": "风格",
    "description": "把明确方向和可用素材写成下一版草稿。",
    "prompt": "你是写手。负责把 seed、当前草稿、用户选择和已启用技能写成下一版草稿。先判断方向和材料是否已经足够清楚；清楚时可以生成初稿、续写、改写、补例子、调顺序或压缩表达。保留用户已经确认过的意图、语气、素材和好句子；草稿越完整，改动越克制。使用自然、清楚、有作品感的短句，减少套话、抽象形容和重复铺垫。写手只是最常使用执行助手的角色之一；当用户选择已经明确、边界清楚时，可以让执行助手生成变体或初稿，但不要替用户跳过核心创作取舍。",
    "appliesTo": "writer",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-reviewer",
    "title": "审稿",
    "category": "检查",
    "description": "检查主线、逻辑、可信度、读者进入和表达风险。",
    "prompt": "你是审稿。负责读当前草稿，判断最影响作品成立的问题，并把审稿判断转成一个问题和三个答案，而不是输出长篇审稿报告。检查主线、逻辑、具体性、可信度、读者进入、标题承诺、语气和风险表达。识别内容是否虚、空、重复、解释过度、证据不足、前后不一致或让读者难进入。适合让执行助手做一次独立审读或列出问题，但最终要由你综合成用户能选择的三个改进方向。",
    "appliesTo": "editor",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-publisher",
    "title": "发布编辑",
    "category": "平台",
    "description": "把近成稿收束成可发布版本或平台化交付。",
    "prompt": "你是发布编辑。负责把接近完成的内容整理到可以被读者看到的状态，包括标题、开头、结尾、压缩、平台版本、话题标签、配图提示、发布说明和风险措辞。判断作品是否已经适合收口；如果主线、材料或逻辑还没成立，应该让它回到策划、资料员、写手或审稿，而不是强行包装发布。适合把明确交付任务交给执行助手，例如短版、平台变体、标题选项、最终检查或发布包。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  }
]
```

Keep `creationRequestOptions` and `inspirations` unchanged.

- [ ] **Step 7: Run default and repository tests**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add config/defaults.example.json src/lib/domain.ts src/lib/db/repository.ts src/lib/defaults.test.ts src/lib/db/repository.test.ts
git commit -m "feat: seed content team system skills"
```

---

### Task 2: Replace Hidden Workflow Stages With Content-Team Lead Prompt

**Files:**
- Delete: `src/lib/ai/content-workflow.ts`
- Delete: `src/lib/ai/content-workflow.test.ts`
- Modify: `src/lib/ai/mastra-context.ts`
- Modify: `src/lib/ai/mastra-context.test.ts`

- [ ] **Step 1: Update prompt tests for content-team coordination**

In `src/lib/ai/mastra-context.test.ts`, replace the first enabled system skill in `input.enabledSkills`:

```ts
    {
      id: "system-planner",
      title: "策划",
      category: "方向",
      description: "决定内容主题、角度、读者和表达目标。",
      prompt: "判断这篇内容最值得写的中心、角度、读者、冲突或感受。",
      appliesTo: "editor",
      isSystem: true,
      defaultEnabled: true,
      isArchived: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    },
```

Update the `buildSharedAgentContext` expectations:

```ts
expect(context).toContain("## Skill: 策划");
expect(context).toContain("说明：决定内容主题、角度、读者和表达目标。");
expect(context).toContain("要求：判断这篇内容最值得写的中心、角度、读者、冲突或感受。");
expect(context).not.toContain("内容创作流程（方向）");
```

In `"asks the director to turn diagnosis into one question and three answers"`, replace workflow-stage expectations with:

```ts
    expect(instructions).toContain("# 内容团队协作");
    expect(instructions).toContain("内容团队的主编");
    expect(instructions).toContain("判断当前最需要哪个已启用角色参与");
    expect(instructions).toContain("不要让用户手动选择角色");
    expect(instructions).toContain("角色只影响你的判断方式");
    expect(instructions).toContain("选题、角度、读者、素材取舍或发布取舍");
    expect(instructions).toContain("执行助手是共享能力");
    expect(instructions).toContain("不要用执行助手替代用户的核心创作选择");
    expect(instructions).not.toContain("# 内容工作流阶段");
    expect(instructions).not.toContain("澄清意图");
    expect(instructions).not.toContain("收口发布");
```

In `"uses separate writer and director roles without leaking the tree choice mechanic"`, replace old order assertions:

```ts
expect(draftInstructions).not.toContain("# 内容团队协作");
expect(draftInstructions).not.toContain("# 内容工作流阶段");
expect(draftInstructions).not.toContain("执行助手是共享能力");
expect(draftInstructions).toContain("要求：判断这篇内容最值得写的中心、角度、读者、冲突或感受。");

expect(optionsInstructions.indexOf("# 内容团队协作")).toBeGreaterThan(optionsInstructions.indexOf("# 已启用 Skills"));
expect(optionsInstructions.indexOf("# 内容团队协作")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
expect(optionsInstructions.indexOf("# 已启用 Skills")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
```

Remove these expectations from the file:

```ts
expect(instructions).toContain("# 内容工作流阶段");
expect(instructions).toContain("澄清意图");
expect(instructions).toContain("选择角度");
expect(instructions).toContain("组织材料");
expect(instructions).toContain("写作或改写");
expect(instructions).toContain("审稿修补");
expect(instructions).toContain("收口发布");
expect(optionsInstructions.indexOf("# 内容工作流阶段")).toBeGreaterThan(optionsInstructions.indexOf("# 已启用 Skills"));
expect(optionsInstructions.indexOf("# 内容工作流阶段")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
```

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: FAIL because `buildTreeOptionsInstructions()` still imports and emits `buildContentWorkflowOptionInstructions()`.

- [ ] **Step 3: Implement the small content-team lead instruction**

In `src/lib/ai/mastra-context.ts`, remove:

```ts
import { buildContentWorkflowOptionInstructions } from "./content-workflow";
```

Inside `buildTreeOptionsInstructions()`, replace:

```ts
    buildContentWorkflowOptionInstructions(),
```

with:

```ts
    buildContentTeamLeadInstructions(),
```

Add this function above `finalSubmitExecutionRules()`:

```ts
function buildContentTeamLeadInstructions() {
  return [
    "# 内容团队协作",
    "你像内容团队的主编一样工作：先判断当前最需要哪个已启用角色参与，再把该角色的判断转成一个问题和三个答案。",
    "不要让用户手动选择角色，也不要把角色名作为额外字段输出；角色只影响你的判断方式。",
    "如果当前仍然需要用户决定选题、角度、读者、素材取舍或发布取舍，先通过三个答案让用户选择。",
    "执行助手是共享能力，所有角色都可以在任务清楚、边界明确且本轮列出可用工具或执行能力时使用。",
    "适合交给执行助手的工作包括找素材、整理资料、生成变体、独立审读、草稿生成、平台版本和发布包。",
    "不要用执行助手替代用户的核心创作选择；方向不清楚时，先把选择交还给用户。"
  ].join("\n");
}
```

- [ ] **Step 4: Delete hidden workflow module and its direct test**

Run:

```bash
git rm src/lib/ai/content-workflow.ts src/lib/ai/content-workflow.test.ts
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/ai/mastra-context.ts src/lib/ai/mastra-context.test.ts src/lib/ai/content-workflow.ts src/lib/ai/content-workflow.test.ts
git commit -m "feat: replace workflow stages with content team prompt"
```

---

### Task 3: Update Executor Coverage For Role Routing

**Files:**
- Modify: `src/lib/ai/mastra-executor.test.ts`

- [ ] **Step 1: Update executor fixture to role-like Skills**

In `src/lib/ai/mastra-executor.test.ts`, replace `enabledSkills` with:

```ts
const enabledSkills: Skill[] = [
  {
    id: "system-writer",
    title: "写手",
    category: "风格",
    description: "把明确方向和可用素材写成下一版草稿。",
    prompt: "写成自然短句，保留用户已经确认过的表达。",
    appliesTo: "writer",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "system-reviewer",
    title: "审稿",
    category: "检查",
    description: "检查主线、逻辑、可信度、读者进入和表达风险。",
    prompt: "做逻辑链审查，把判断转成用户能选择的三个方向。",
    appliesTo: "editor",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "system-publisher",
    title: "发布编辑",
    category: "平台",
    description: "把近成稿收束成可发布版本或平台化交付。",
    prompt: "标题不要夸张，发布前检查标题承诺和风险表达。",
    appliesTo: "both",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  }
];
```

- [ ] **Step 2: Update draft prompt expectations**

In `"passes writer and shared skills to the draft agent"`, use:

```ts
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.stringContaining("写成自然短句")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.stringContaining("标题不要夸张")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.not.stringContaining("逻辑链审查")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.not.stringContaining("# 内容团队协作")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.not.stringContaining("# 内容工作流阶段")
);
```

- [ ] **Step 3: Update options prompt expectations**

In `"passes editor and shared skills to the options agent"`, use:

```ts
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("逻辑链审查")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("标题不要夸张")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.not.stringContaining("写成自然短句")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("# 内容团队协作")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("执行助手是共享能力")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.not.stringContaining("# 内容工作流阶段")
);
```

Remove this old expectation:

```ts
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("如果草稿已经连贯且接近可发布，优先收口发布")
);
```

- [ ] **Step 4: Run executor tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/ai/mastra-executor.test.ts
git commit -m "test: cover content team prompt routing"
```

---

### Task 4: Make Visible Skill Copy Match Content-Team Roles

**Files:**
- Modify: `src/components/skills/SkillPicker.tsx`
- Modify: `src/components/skills/SkillPicker.test.tsx`
- Modify: `src/components/skills/SkillLibraryPanel.tsx`
- Modify: `src/components/skills/SkillLibraryPanel.test.tsx`
- Modify: `src/components/root-memory/RootMemorySetup.test.tsx`

- [ ] **Step 1: Update SkillPicker grouping copy**

In `src/components/skills/SkillPicker.tsx`, replace `effectGroups` with:

```ts
const effectGroups = [
  { appliesTo: "writer", title: "写手", effect: "作用：草稿" },
  { appliesTo: "editor", title: "策划 / 资料 / 审稿", effect: "作用：三个选择" },
  { appliesTo: "both", title: "发布编辑 / 全程", effect: "作用：草稿与选择" }
] as const;
```

- [ ] **Step 2: Update SkillPicker tests**

In `src/components/skills/SkillPicker.test.tsx`, replace the group/effect assertions with:

```ts
expect(screen.getByRole("group", { name: "写手" })).toBeInTheDocument();
expect(screen.getByRole("group", { name: "策划 / 资料 / 审稿" })).toBeInTheDocument();
expect(screen.getByRole("group", { name: "发布编辑 / 全程" })).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "写手" })).getByText("作用：草稿")).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "策划 / 资料 / 审稿" })).getByText("作用：三个选择")).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "发布编辑 / 全程" })).getByText("作用：草稿与选择")).toBeInTheDocument();
expect(
  within(screen.getByRole("group", { name: "策划 / 资料 / 审稿" })).getByRole("checkbox", { name: /逻辑链审查/ })
).toBeChecked();
```

- [ ] **Step 3: Update SkillLibraryPanel effect copy**

In `src/components/skills/SkillLibraryPanel.tsx`, update the two effect checkboxes:

```tsx
<span>影响草稿</span>
```

and:

```tsx
<span>影响选择</span>
```

Update `effectLabelFor()`:

```ts
function effectLabelFor(appliesTo: Skill["appliesTo"]) {
  if (appliesTo === "writer") return "作用：草稿";
  if (appliesTo === "editor") return "作用：选择";
  return "作用：草稿、选择";
}
```

Update `groupSkills()`:

```ts
function groupSkills(skills: Skill[]) {
  const groups = [
    ["影响草稿", "writer"],
    ["影响选择", "editor"],
    ["影响草稿和选择", "both"]
  ] as const;

  return groups
    .map(([label, appliesTo]) => [label, skills.filter((skill) => skill.appliesTo === appliesTo)] as const)
    .filter(([, groupSkills]) => groupSkills.length > 0);
}
```

- [ ] **Step 4: Update SkillLibraryPanel tests**

In `src/components/skills/SkillLibraryPanel.test.tsx`, replace:

```ts
await userEvent.click(screen.getByRole("checkbox", { name: "影响建议" }));
```

with:

```ts
await userEvent.click(screen.getByRole("checkbox", { name: "影响选择" }));
```

Replace:

```ts
expect(within(systemItem).getByText("影响：建议")).toBeInTheDocument();
```

with:

```ts
expect(within(systemItem).getByText("作用：选择")).toBeInTheDocument();
```

Replace:

```ts
expect(screen.getByRole("checkbox", { name: "影响建议" })).toBeChecked();
```

with:

```ts
expect(screen.getByRole("checkbox", { name: "影响选择" })).toBeChecked();
```

- [ ] **Step 5: Update RootMemorySetup tests**

In `src/components/root-memory/RootMemorySetup.test.tsx`, replace every group-name assertion for `"审稿重点"` with `"策划 / 资料 / 审稿"`:

```ts
expect(screen.queryByRole("group", { name: "策划 / 资料 / 审稿" })).not.toBeInTheDocument();
expect(screen.getByRole("group", { name: "策划 / 资料 / 审稿" })).toBeInTheDocument();
```

- [ ] **Step 6: Run component tests**

Run:

```bash
npm test -- src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/components/skills/SkillPicker.tsx src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
git commit -m "chore: align skill UI copy with content roles"
```

---

### Task 5: Full Verification

**Files:**
- Verify all modified files from Tasks 1-4.

- [ ] **Step 1: Search for obsolete hidden workflow text**

Run:

```bash
rg -n "内容工作流阶段|content-workflow|澄清意图|收口发布" src config
```

Expected: no output.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts src/lib/ai/mastra-context.test.ts src/lib/ai/mastra-executor.test.ts src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run adjacent defaults/inspiration tests**

Run:

```bash
npm test -- src/lib/inspirations.test.ts src/app/api/inspirations/route.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- src/lib/ai/mastra-context.ts config/defaults.example.json src/lib/domain.ts src/lib/db/repository.ts
```

Expected: diff shows five visible content-team Skills, a small content-team prompt helper, removed legacy migration code, and no hidden stage module.

---

## Self-Review Notes

- Spec coverage: the plan keeps the three-choice loop, replaces hidden stages with visible system Skills, defaults all five roles on, keeps advanced disabling through existing Skill toggles, treats execution helpers as shared capability, and avoids new workflow schema.
- Old-data compatibility: intentionally not supported in this pass. Legacy system-skill migration code and tests are removed instead of expanded.
- Prompt coverage: options prompt gets team-lead coordination; draft prompt does not receive that coordination block.
- UI coverage: Skill grouping labels stop implying that every editor-side Skill is an "审稿重点".
- Verification coverage: focused tests, adjacent defaults/inspiration tests, obsolete-text search, and typecheck are included.
