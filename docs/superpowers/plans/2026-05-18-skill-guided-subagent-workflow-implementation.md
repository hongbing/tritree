# Skill-Guided Subagent Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Skill-guided subagent workflow where role Skills provide content-team judgment, subagent tools do bounded work, and the main agent owns three-choice interaction plus actual-work retry.

**Architecture:** Keep Tritree's existing Mastra agent/executor pipeline and add a small subagent runtime as executable tools. Default role Skills become role-focused prompts with delegation guidance; the main agent receives all enabled Skills, available subagent templates, temporary-subagent capability, and final submit tools. Runtime option submissions with no prior work require a `decisionRationale`; no-op runs retry with an explicit actual-work reminder.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Vitest, Mastra Agent/tools, SQLite via `node:sqlite`, existing Tritree defaults and Skill runtime.

---

## File Structure

- Modify `config/defaults.example.json`: replace the two default system Skills with five role-focused Skills.
- Modify `src/lib/domain.ts`: add optional `decisionRationale` to option outputs and remove old merged-skill migration constants.
- Modify `src/lib/db/repository.ts`: remove old merged-skill backfill.
- Modify `src/lib/defaults.test.ts`: verify shipped role Skills are role-focused and delegation-aware.
- Modify `src/lib/db/repository.test.ts`: update repository default system Skill expectations and delete old migration tests.
- Create `src/lib/ai/subagent-templates.ts`: define precreated subagent templates and summary formatting.
- Create `src/lib/ai/subagent-templates.test.ts`: test template ids and summaries.
- Create `src/lib/ai/subagent-runtime.ts`: expose `run_subagent_template` and `run_temporary_subagent` runtime tools.
- Create `src/lib/ai/subagent-runtime.test.ts`: test tool creation and runner inputs.
- Delete `src/lib/ai/content-workflow.ts`: remove hidden stage prompt helper.
- Delete `src/lib/ai/content-workflow.test.ts`: remove direct tests for hidden stages.
- Modify `src/lib/ai/mastra-context.ts`: add main-agent orchestration, subagent templates, three-choice protocol, and actual-work instructions.
- Modify `src/lib/ai/mastra-context.test.ts`: update prompt expectations around Skills, templates, and protocol ownership.
- Modify `src/lib/ai/mastra-executor.ts`: load subagent tools, stop tree-agent Skill filtering by writer/editor target, and validate no-op runtime options.
- Modify `src/lib/ai/mastra-executor.test.ts`: cover all-Skill prompt routing, subagent runtime tool integration, and actual-work retry.
- Modify `src/components/skills/SkillPicker.tsx`: update grouping copy away from writer/editor semantics while retaining current field storage.
- Modify `src/components/skills/SkillPicker.test.tsx`: update group label expectations.
- Modify `src/components/skills/SkillLibraryPanel.tsx`: update effect copy from draft/suggestion to work/interaction language.
- Modify `src/components/skills/SkillLibraryPanel.test.tsx`: update effect label expectations.
- Modify `src/components/root-memory/RootMemorySetup.test.tsx`: update collapsed/expanded Skill group expectations.

---

### Task 1: Default Role Skills And Fresh Defaults

**Files:**
- Modify: `config/defaults.example.json`
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/db/repository.ts`
- Modify: `src/lib/defaults.test.ts`
- Modify: `src/lib/db/repository.test.ts`

- [ ] **Step 1: Write failing defaults tests**

In `src/lib/defaults.test.ts`, add this import:

```ts
import { readFileSync } from "node:fs";
```

Add these constants after `validConfig`:

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

Add this test inside `describe("defaults config loader", () => {` after `parses valid defaults through shared schemas`:

```ts
  it("ships role-focused content team skills with delegation guidance", () => {
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
    expect(defaults.systemSkills.every((skill) => skill.defaultEnabled)).toBe(true);
    expect(defaults.systemSkills.every((skill) => !skill.isArchived)).toBe(true);
    expect(defaults.systemSkills.every((skill) => skill.appliesTo === "both")).toBe(true);

    for (const skill of defaults.systemSkills) {
      expect(skill.prompt).toContain("角色职责");
      expect(skill.prompt).toContain("有用输出");
      expect(skill.prompt).toContain("适合委托");
      expect(skill.prompt).toContain("调用前最小上下文");
      expect(skill.prompt).not.toContain("roundIntent");
      expect(skill.prompt).not.toContain("options[]");
      expect(skill.prompt).not.toContain("三个答案");
      expect(skill.prompt).not.toContain("让用户选择");
    }

    expect(defaults.systemSkills.find((skill) => skill.id === "system-researcher")?.prompt).toContain("material-search");
    expect(defaults.systemSkills.find((skill) => skill.id === "system-publisher")?.prompt).toContain("platform-rewrite");
  });
```

- [ ] **Step 2: Update repository test fixture**

In `src/lib/db/repository.test.ts`, replace `repositorySystemSkills` with:

```ts
const repositorySystemSkills: ConfiguredSystemSkill[] = [
  {
    id: "system-planner",
    title: "策划",
    category: "方向",
    description: "决定内容主题、角度、读者和表达目标。",
    prompt: "角色职责：澄清主题、读者、主张和角度。有用输出：方向判断。适合委托：列角度。调用前最小上下文：seed、当前草稿、约束。",
    appliesTo: "both",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-researcher",
    title: "资料员",
    category: "方向",
    description: "补足例子、场景、事实、背景和可用素材。",
    prompt: "角色职责：寻找和组织素材。有用输出：素材笔记。适合委托：material-search、material-organizer。调用前最小上下文：主题、问题、已有草稿。",
    appliesTo: "both",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-writer",
    title: "写手",
    category: "风格",
    description: "把明确方向和可用素材写成下一版草稿。",
    prompt: "角色职责：写出草稿或修订。有用输出：正文草稿。适合委托：生成局部变体。调用前最小上下文：方向、素材、用户语气。",
    appliesTo: "both",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-reviewer",
    title: "审稿",
    category: "检查",
    description: "检查主线、逻辑、可信度、读者进入和表达风险。",
    prompt: "角色职责：审读当前稿件。有用输出：审稿发现。适合委托：independent-review。调用前最小上下文：草稿、目标读者、发布场景。",
    appliesTo: "both",
    defaultEnabled: true,
    isArchived: false
  },
  {
    id: "system-publisher",
    title: "发布编辑",
    category: "平台",
    description: "把近成稿收束成可发布版本或平台化交付。",
    prompt: "角色职责：准备发布交付。有用输出：发布包笔记。适合委托：title-variants、platform-rewrite。调用前最小上下文：草稿、平台、长度约束。",
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

Update existing repository expectations that list all system Skills:

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

In `"updates configured system skills when the config file changes"`, change the config rewrite to update only `system-writer` by id:

```ts
          systemSkills: repositorySystemSkills.map((skill) =>
            skill.id === "system-writer"
              ? {
                  ...repositoryWriterSkill,
                  title: "配置写手",
                  prompt: "配置文件里的新版写手提示词。",
                  defaultEnabled: false
                }
              : skill
          ),
```

Then expect:

```ts
expect(updated).toEqual(expect.objectContaining({
  title: "配置写手",
  prompt: "配置文件里的新版写手提示词。",
  defaultEnabled: false
}));
expect(reopened.defaultEnabledSkillIds()).toEqual([
  "system-publisher",
  "system-planner",
  "system-researcher",
  "system-reviewer"
]);
```

In `"archives global system skills that were removed from config"`, write the reopened config with only `[repositoryReviewerSkill]` and keep:

```ts
expect(reopened.defaultEnabledSkillIds()).toEqual(["system-reviewer"]);
```

In `"persists skill applicability for system and user skills"`, update expectations:

```ts
const reviewerSkill = repo.listSkills(user.id).find((skill) => skill.id === "system-reviewer");
const writerSkill = repo.listSkills(user.id).find((skill) => skill.id === "system-writer");
expect(reviewerSkill?.appliesTo).toBe("both");
expect(writerSkill?.appliesTo).toBe("both");
```

Delete these repository tests:

- `backfills merged system skills for sessions that referenced legacy system skills`
- `backfills only active configured merged system skills for legacy sessions`

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

- [ ] **Step 3: Run tests to verify defaults fail**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts
```

Expected: FAIL because `config/defaults.example.json` still contains two broad system Skills and repository code still contains merged-skill migration constants.

- [ ] **Step 4: Remove old merged-skill migration constants and backfill**

In `src/lib/domain.ts`, delete these exports:

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

Delete the entire `backfillMergedSystemSkillsForLegacySessions()` function.

- [ ] **Step 5: Replace default role Skills**

In `config/defaults.example.json`, replace `systemSkills` with this array. Keep `creationRequestOptions` and `inspirations` unchanged.

```json
[
  {
    "id": "system-planner",
    "title": "策划",
    "category": "方向",
    "description": "决定内容主题、角度、读者和表达目标。",
    "prompt": "角色职责：澄清内容的主题、读者、主张、角度、冲突和表达目标，帮助作品先有中心再展开。\n关注输入：seed、当前草稿、用户已确认的目标、读者场景、已有素材和限制。\n有用输出：方向判断、核心问题、读者判断、角度候选、取舍说明。\n适合委托：当主题很宽时，可以建议使用临时 subagent 列出候选角度、读者场景或反差素材。\n保留给主 agent / 用户：最终立场、目标读者、核心角度和主要取舍。\n调用前最小上下文：主题或 seed、当前草稿摘要、用户约束、需要比较的问题。\n回来后如何使用：把候选方向收成清楚的方向判断，再由主 agent 决定继续执行、更新草稿或发起用户选择。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-researcher",
    "title": "资料员",
    "category": "方向",
    "description": "补足例子、场景、事实、背景和可用素材。",
    "prompt": "角色职责：发现当前内容缺少的真实材料，并组织例子、场景、事实、背景、对比、引用、参考和细节。\n关注输入：主题、草稿中的判断、已有素材、事实边界、读者需要理解的背景。\n有用输出：素材笔记、证据缺口、可用例子、来源摘要、材料分组。\n适合委托：需要查找资料、归纳来源、整理案例或列缺失证据时，优先建议使用 material-search 或 material-organizer。\n保留给主 agent / 用户：材料取舍优先级、事实风险判断、作品最终立场。\n调用前最小上下文：主题、当前草稿、要支撑的判断、已确认约束、需要查找或整理的问题。\n回来后如何使用：把结果合并成素材判断，再由主 agent 决定更新草稿、继续执行或发起用户选择。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-writer",
    "title": "写手",
    "category": "风格",
    "description": "把明确方向和可用素材写成下一版草稿。",
    "prompt": "角色职责：把已明确的方向、素材和用户意图写成初稿、续写或修订稿。\n关注输入：当前草稿、用户选择、方向判断、素材笔记、语气偏好、平台约束。\n有用输出：标题、正文、局部改写、版本差异说明、可继续加工的草稿。\n适合委托：方向和边界清楚时，可以建议使用临时 subagent 生成局部变体、备选开头、例子段落或不同长度版本。\n保留给主 agent / 用户：是否改变核心立场、是否大幅改写、最终采用哪个版本。\n调用前最小上下文：写作目标、当前草稿、必须保留的表达、可用素材、长度和语气约束。\n回来后如何使用：选取可用表达并整合进草稿，再由主 agent 提交更新或继续调度。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-reviewer",
    "title": "审稿",
    "category": "检查",
    "description": "检查主线、逻辑、可信度、读者进入和表达风险。",
    "prompt": "角色职责：审读当前稿件，发现影响作品成立的问题和机会。\n关注输入：当前草稿、写作目标、目标读者、标题承诺、事实边界、发布场景。\n有用输出：审稿发现、问题优先级、风险点、修订建议、可直接执行的改进项。\n适合委托：需要独立第二视角审读时，优先建议使用 independent-review。\n保留给主 agent / 用户：最终修改优先级、是否改变方向、是否发布。\n调用前最小上下文：草稿、标题或发布承诺、目标读者、希望检查的重点。\n回来后如何使用：把独立审读结果合并为主 agent 的审稿判断，再决定更新草稿、继续执行或发起用户选择。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  },
  {
    "id": "system-publisher",
    "title": "发布编辑",
    "category": "平台",
    "description": "把近成稿收束成可发布版本或平台化交付。",
    "prompt": "角色职责：把接近完成的内容整理成面向读者或平台的交付形态。\n关注输入：当前草稿、平台、长度、标题承诺、话题标签、配图提示、风险措辞。\n有用输出：发布包笔记、标题候选、开头或结尾整理、短版、平台改写建议、最终检查项。\n适合委托：需要标题候选时建议使用 title-variants；需要平台版本或长度适配时建议使用 platform-rewrite。\n保留给主 agent / 用户：发布时机、最终标题、是否改变作品主线。\n调用前最小上下文：草稿、平台目标、长度要求、必须保留内容、风险边界。\n回来后如何使用：整合为发布包或最终修订，再由主 agent 提交发布包、更新草稿或发起用户选择。",
    "appliesTo": "both",
    "defaultEnabled": true,
    "isArchived": false
  }
]
```

- [ ] **Step 6: Run defaults and repository tests**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add config/defaults.example.json src/lib/domain.ts src/lib/db/repository.ts src/lib/defaults.test.ts src/lib/db/repository.test.ts
git commit -m "feat: seed skill-guided content roles"
```

---

### Task 2: Precreated And Temporary Subagent Runtime Tools

**Files:**
- Create: `src/lib/ai/subagent-templates.ts`
- Create: `src/lib/ai/subagent-templates.test.ts`
- Create: `src/lib/ai/subagent-runtime.ts`
- Create: `src/lib/ai/subagent-runtime.test.ts`

- [ ] **Step 1: Add template tests**

Create `src/lib/ai/subagent-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_TEMPLATES,
  formatSubagentTemplateSummaries,
  getSubagentTemplate
} from "./subagent-templates";

describe("subagent templates", () => {
  it("defines the initial precreated subagent templates", () => {
    expect(DEFAULT_SUBAGENT_TEMPLATES.map((template) => template.id)).toEqual([
      "material-search",
      "material-organizer",
      "independent-review",
      "title-variants",
      "platform-rewrite"
    ]);
    expect(getSubagentTemplate("material-search")?.title).toBe("素材搜索");
    expect(getSubagentTemplate("platform-rewrite")?.expectedOutput).toContain("平台版本");
  });

  it("formats concise summaries for the main agent prompt", () => {
    const summaries = formatSubagentTemplateSummaries();

    expect(summaries).toContain("material-search");
    expect(summaries).toContain("素材搜索");
    expect(summaries).toContain("platform-rewrite");
    expect(summaries).not.toContain("undefined");
  });
});
```

- [ ] **Step 2: Create subagent template definitions**

Create `src/lib/ai/subagent-templates.ts`:

```ts
export type SubagentTemplate = {
  description: string;
  expectedOutput: string;
  id: string;
  prompt: string;
  title: string;
};

export const DEFAULT_SUBAGENT_TEMPLATES = [
  {
    id: "material-search",
    title: "素材搜索",
    description: "查找候选来源、例子、参考、背景材料或相似案例。",
    expectedOutput: "返回可用素材列表，每条包含用途、摘要、可信度提示和后续使用建议。",
    prompt: [
      "你负责为内容创作查找候选素材。",
      "优先输出可用于支撑观点、补具体场景或提供背景的材料。",
      "区分事实、观察、类比和待验证信息。",
      "不要决定作品最终立场。"
    ].join("\n")
  },
  {
    id: "material-organizer",
    title: "资料整理",
    description: "整理已有笔记、来源、片段和案例，形成可写材料组。",
    expectedOutput: "返回材料分组、每组用途、缺失证据和建议使用位置。",
    prompt: [
      "你负责把已有材料整理成可写结构。",
      "按观点、场景、例子、背景、反例和风险分组。",
      "指出材料缺口和重复材料。",
      "不要改写成最终正文。"
    ].join("\n")
  },
  {
    id: "independent-review",
    title: "独立审读",
    description: "从第二视角审读草稿，发现逻辑、可信度、读者进入和表达问题。",
    expectedOutput: "返回审稿发现、严重程度、证据位置和可执行修订建议。",
    prompt: [
      "你负责独立审读内容草稿。",
      "关注主线、逻辑跳跃、具体性、可信度、读者进入、标题承诺和风险表达。",
      "按影响程度排序问题。",
      "不要替主 agent 决定最终修改路线。"
    ].join("\n")
  },
  {
    id: "title-variants",
    title: "标题变体",
    description: "在明确约束下生成标题、开头或钩子变体。",
    expectedOutput: "返回标题或开头候选，并说明各自适合的读者承诺和风险。",
    prompt: [
      "你负责生成标题、开头或钩子变体。",
      "保持与正文实际内容一致。",
      "每个候选都说明承诺、语气和可能风险。",
      "不要夸大正文没有支撑的内容。"
    ].join("\n")
  },
  {
    id: "platform-rewrite",
    title: "平台改写",
    description: "把已有草稿适配到目标平台、长度或发布形态。",
    expectedOutput: "返回平台版本、改写说明、保留内容和删改内容。",
    prompt: [
      "你负责把已有草稿改写成目标平台版本。",
      "保留核心主张和已确认素材。",
      "按平台、长度、读者和语气约束调整表达。",
      "标明主要删改和风险表达。"
    ].join("\n")
  }
] as const satisfies SubagentTemplate[];

export type SubagentTemplateId = (typeof DEFAULT_SUBAGENT_TEMPLATES)[number]["id"];

export function getSubagentTemplate(id: string, templates: readonly SubagentTemplate[] = DEFAULT_SUBAGENT_TEMPLATES) {
  return templates.find((template) => template.id === id);
}

export function formatSubagentTemplateSummaries(
  templates: readonly SubagentTemplate[] = DEFAULT_SUBAGENT_TEMPLATES
) {
  return templates
    .map((template) => `- ${template.id}（${template.title}）：${template.description} 期望输出：${template.expectedOutput}`)
    .join("\n");
}
```

- [ ] **Step 3: Add subagent runtime tests**

Create `src/lib/ai/subagent-runtime.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SUBAGENT_TEMPLATES } from "./subagent-templates";
import { createSubagentRuntimeTools } from "./subagent-runtime";

describe("createSubagentRuntimeTools", () => {
  it("exposes precreated and temporary subagent tools with summaries", async () => {
    const runtime = createSubagentRuntimeTools({
      runSubagentTask: vi.fn(async () => "执行结果")
    });

    expect(runtime.subagentTemplateSummaries.join("\n")).toContain("material-search");
    expect(runtime.toolSummaries.join("\n")).toContain("run_subagent_template");
    expect(runtime.toolSummaries.join("\n")).toContain("run_temporary_subagent");
    expect(runtime.tools).toEqual(expect.objectContaining({
      run_subagent_template: expect.anything(),
      run_temporary_subagent: expect.anything()
    }));
  });

  it("passes template task inputs to the injected runner", async () => {
    const runSubagentTask = vi.fn(async () => "素材结果");
    const runtime = createSubagentRuntimeTools({ runSubagentTask });
    const tool = runtime.tools.run_subagent_template as {
      execute: (input: {
        context: string;
        expectedOutput?: string;
        task: string;
        templateId: string;
      }) => Promise<unknown>;
    };

    await expect(
      tool.execute({
        templateId: "material-search",
        task: "找三个真实案例",
        context: "主题：团队写作规范",
        expectedOutput: "列出案例和用途"
      })
    ).resolves.toEqual({
      ok: true,
      result: "素材结果",
      templateId: "material-search",
      title: "素材搜索"
    });

    expect(runSubagentTask).toHaveBeenCalledWith(expect.objectContaining({
      context: "主题：团队写作规范",
      expectedOutput: "列出案例和用途",
      task: "找三个真实案例",
      template: DEFAULT_SUBAGENT_TEMPLATES[0],
      title: "素材搜索"
    }));
  });

  it("passes temporary subagent task inputs to the injected runner", async () => {
    const runSubagentTask = vi.fn(async () => "比较结果");
    const runtime = createSubagentRuntimeTools({ runSubagentTask });
    const tool = runtime.tools.run_temporary_subagent as {
      execute: (input: {
        constraints?: string;
        context: string;
        expectedOutput: string;
        task: string;
        title: string;
      }) => Promise<unknown>;
    };

    await expect(
      tool.execute({
        title: "结构比较",
        task: "比较两个结构",
        context: "结构 A 和结构 B",
        expectedOutput: "指出更适合当前目标的结构",
        constraints: "保持当前观点不变"
      })
    ).resolves.toEqual({
      ok: true,
      result: "比较结果",
      title: "结构比较"
    });

    expect(runSubagentTask).toHaveBeenCalledWith(expect.objectContaining({
      constraints: "保持当前观点不变",
      context: "结构 A 和结构 B",
      expectedOutput: "指出更适合当前目标的结构",
      task: "比较两个结构",
      template: undefined,
      title: "结构比较"
    }));
  });
});
```

- [ ] **Step 4: Create subagent runtime tools**

Create `src/lib/ai/subagent-runtime.ts`:

```ts
import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { DEFAULT_MAX_OUTPUT_TOKENS, resolveModelContextBudget } from "./model-context";
import { createTreeableAnthropicModel } from "./mastra-agents";
import {
  DEFAULT_SUBAGENT_TEMPLATES,
  formatSubagentTemplateSummaries,
  getSubagentTemplate,
  type SubagentTemplate
} from "./subagent-templates";

export type SubagentTask = {
  constraints?: string;
  context: string;
  env?: Record<string, string | undefined>;
  expectedOutput: string;
  task: string;
  template?: SubagentTemplate;
  title: string;
};

export type SubagentTaskRunner = (task: SubagentTask) => Promise<string>;

export function createSubagentRuntimeTools({
  env = process.env,
  runSubagentTask = runSubagentTaskWithModel,
  templates = DEFAULT_SUBAGENT_TEMPLATES
}: {
  env?: Record<string, string | undefined>;
  runSubagentTask?: SubagentTaskRunner;
  templates?: readonly SubagentTemplate[];
} = {}): { subagentTemplateSummaries: string[]; toolSummaries: string[]; tools: ToolsInput } {
  const templateIds = templates.map((template) => template.id);
  const templateIdSchema = z.enum(templateIds as [string, ...string[]]);

  const runSubagentTemplate = createTool({
    id: "run_subagent_template",
    description:
      "Run a precreated Tritree subagent template for bounded content work. Use this for common tasks such as material search, material organization, independent review, title variants, or platform rewrite.",
    inputSchema: z.object({
      context: z.string().min(1).describe("Minimal relevant context: current topic, draft summary, user constraints, and known facts."),
      expectedOutput: z.string().min(1).optional().describe("Specific output requested from the subagent."),
      task: z.string().min(1).describe("The bounded task the subagent should perform."),
      templateId: templateIdSchema.describe("Precreated subagent template id.")
    }),
    execute: async ({ context, expectedOutput, task, templateId }) => {
      const template = getSubagentTemplate(templateId, templates);
      if (!template) throw new Error(`Unknown subagent template: ${templateId}`);
      const result = await runSubagentTask({
        context,
        env,
        expectedOutput: expectedOutput || template.expectedOutput,
        task,
        template,
        title: template.title
      });
      return {
        ok: true,
        result,
        templateId,
        title: template.title
      };
    }
  });

  const runTemporarySubagent = createTool({
    id: "run_temporary_subagent",
    description:
      "Create and run a one-off Tritree subagent for a bounded task when no precreated template fits. Provide compact context and an expected output.",
    inputSchema: z.object({
      constraints: z.string().optional().describe("Constraints inherited from the active Skill and user request."),
      context: z.string().min(1).describe("Minimal relevant context for the temporary subagent."),
      expectedOutput: z.string().min(1).describe("Specific output requested from the temporary subagent."),
      task: z.string().min(1).describe("The bounded task the temporary subagent should perform."),
      title: z.string().min(1).describe("Short name for the temporary subagent task.")
    }),
    execute: async ({ constraints, context, expectedOutput, task, title }) => {
      const result = await runSubagentTask({
        constraints,
        context,
        env,
        expectedOutput,
        task,
        title
      });
      return {
        ok: true,
        result,
        title
      };
    }
  });

  return {
    subagentTemplateSummaries: [formatSubagentTemplateSummaries(templates)],
    toolSummaries: [
      `run_subagent_template：调用预创建 subagent 模板完成边界清楚的内容任务。可用模板：${templates.map((template) => `${template.id}（${template.title}）`).join("、")}。`,
      "run_temporary_subagent：创建一次性 subagent 完成没有合适模板的边界清楚任务。调用时必须提供短任务、最小上下文和期望输出。"
    ],
    tools: {
      run_subagent_template: runSubagentTemplate,
      run_temporary_subagent: runTemporarySubagent
    }
  };
}

async function runSubagentTaskWithModel({
  constraints,
  context,
  env,
  expectedOutput,
  task,
  template,
  title
}: SubagentTask) {
  const instructions = [
    `# ${title}`,
    template?.prompt ?? "你是 Tritree 的临时执行助手，负责完成一个边界清楚的内容创作子任务。",
    "# 执行规则",
    "只完成给定子任务，不决定作品最终方向。",
    "使用输入上下文，不补造不存在的事实。",
    "输出要便于主 agent 继续整合。",
    constraints ? `# 约束\n${constraints}` : "",
    `# 期望输出\n${expectedOutput}`
  ]
    .filter(Boolean)
    .join("\n\n");

  const agent = new Agent({
    id: "tritree-subagent-runner",
    name: title,
    instructions,
    model: createTreeableAnthropicModel(env),
    defaultOptions: { modelSettings: { maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS } },
    inputProcessors: [new TokenLimiterProcessor({ limit: resolveModelContextBudget(env).inputBudgetTokens })]
  });
  const result = await agent.generate([
    {
      role: "user",
      content: [`任务：${task}`, "", "# 上下文", context].join("\n")
    }
  ], {
    maxSteps: 4
  });
  return textFromAgentResult(result);
}

function textFromAgentResult(result: unknown) {
  if (isRecord(result)) {
    const text = result.text;
    if (typeof text === "string" && text.trim()) return text;
    const output = result.output;
    if (typeof output === "string" && output.trim()) return output;
    const object = result.object;
    if (typeof object === "string" && object.trim()) return object;
    if (output !== undefined) return JSON.stringify(output);
    if (object !== undefined) return JSON.stringify(object);
  }
  return typeof result === "string" ? result : JSON.stringify(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
```

- [ ] **Step 5: Run subagent tests**

Run:

```bash
npm test -- src/lib/ai/subagent-templates.test.ts src/lib/ai/subagent-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/ai/subagent-templates.ts src/lib/ai/subagent-templates.test.ts src/lib/ai/subagent-runtime.ts src/lib/ai/subagent-runtime.test.ts
git commit -m "feat: add subagent runtime tools"
```

---

### Task 3: Main Agent Prompt And Skill Routing

**Files:**
- Delete: `src/lib/ai/content-workflow.ts`
- Delete: `src/lib/ai/content-workflow.test.ts`
- Modify: `src/lib/ai/mastra-context.ts`
- Modify: `src/lib/ai/mastra-context.test.ts`
- Modify: `src/lib/ai/mastra-executor.ts`

- [ ] **Step 1: Update prompt tests**

In `src/lib/ai/mastra-context.test.ts`, replace the first enabled Skill fixture with a role Skill:

```ts
    {
      id: "system-researcher",
      title: "资料员",
      category: "方向",
      description: "补足例子、场景、事实、背景和可用素材。",
      prompt: "角色职责：寻找和组织素材。有用输出：素材笔记。适合委托：material-search。调用前最小上下文：主题、问题、已有草稿。",
      appliesTo: "both",
      isSystem: true,
      defaultEnabled: true,
      isArchived: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    },
```

Update the `input` object with template summaries:

```ts
  subagentTemplateSummaries: [
    "- material-search（素材搜索）：查找候选来源、例子、参考、背景材料或相似案例。"
  ],
```

Update shared-context expectations:

```ts
expect(context).toContain("# 可用 Subagent 模板");
expect(context).toContain("material-search（素材搜索）");
expect(context).toContain("## Skill: 资料员");
expect(context).toContain("要求：角色职责：寻找和组织素材");
expect(context).not.toContain("内容创作流程（方向）");
```

Replace the old options-instruction test with:

```ts
  it("keeps role Skills separate from the main-agent three-choice protocol", () => {
    const instructions = buildTreeOptionsInstructions(input);

    expect(instructions).toContain("# 主 agent 任务");
    expect(instructions).toContain("先做当前最有用的一步工作");
    expect(instructions).toContain("可调用 run_subagent_template");
    expect(instructions).toContain("可调用 run_temporary_subagent");
    expect(instructions).toContain("# 三选一协议");
    expect(instructions).toContain("decisionRationale");
    expect(instructions).toContain("真实用户决策");
    expect(instructions).toContain("actual-work");
    expect(instructions).not.toContain("# 内容工作流阶段");
    expect(instructions).not.toContain("澄清意图");
    expect(instructions).not.toContain("收口发布");
  });
```

In the writer/director separation test, update assertions:

```ts
expect(draftInstructions).toContain("# 主 agent 任务");
expect(draftInstructions).toContain("提交更新后的 draft");
expect(draftInstructions).toContain("可调用 run_subagent_template");
expect(draftInstructions).not.toContain("# 内容工作流阶段");

expect(optionsInstructions.indexOf("# 可用 Subagent 模板")).toBeGreaterThan(optionsInstructions.indexOf("# 已启用 Skills"));
expect(optionsInstructions.indexOf("# 主 agent 任务")).toBeLessThan(optionsInstructions.indexOf("# 三选一协议"));
expect(optionsInstructions.indexOf("# 三选一协议")).toBeLessThan(optionsInstructions.indexOf("# 输出要求"));
```

Remove assertions that expect hidden workflow stages, writer/editor split language, or `# 总导演任务`.

- [ ] **Step 2: Run prompt tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: FAIL because `SharedAgentContextInput` lacks subagent template summaries and `buildTreeOptionsInstructions()` still imports `buildContentWorkflowOptionInstructions()`.

- [ ] **Step 3: Update shared context input and prompt builder**

In `src/lib/ai/mastra-context.ts`, remove:

```ts
import { buildContentWorkflowOptionInstructions } from "./content-workflow";
```

Add `subagentTemplateSummaries` to `SharedAgentContextInput`:

```ts
  subagentTemplateSummaries?: string[];
```

In `buildSharedAgentContext()`, add this section after available Skill summaries and before tools:

```ts
    input.subagentTemplateSummaries?.length
      ? ["# 可用 Subagent 模板", input.subagentTemplateSummaries.join("\n")].join("\n")
      : "",
```

Replace `buildTreeDraftInstructions()` with a main-agent draft-oriented prompt:

```ts
export function buildTreeDraftInstructions(input: SharedAgentContextInput) {
  return [
    "# 主 agent 任务",
    "你负责协调已启用 Skills、工具和 subagent，完成本轮内容更新。",
    "本轮目标是提交更新后的 draft，而不是输出解释性建议。",
    buildSharedAgentContext(input),
    buildMainAgentExecutionProtocol(input, "draft"),
    "# 输出要求",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本任务产出的用户可见字段包括：roundIntent、draft.title、draft.body、draft.hashtags 和 draft.imagePrompt。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "最终结构化结果必须覆盖：本轮意图、标题、正文、话题和配图提示。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。",
    "# 输出前检查",
    "确认每个已启用 Skill 的要求已落实到本任务产出的用户可见字段。"
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

Replace `buildTreeOptionsInstructions()` with:

```ts
export function buildTreeOptionsInstructions(input: SharedAgentContextInput) {
  return [
    "# 主 agent 任务",
    "你负责协调已启用 Skills、工具和 subagent，先做当前最有用的一步工作，再判断是否需要用户决策。",
    "三选一是用户交互协议，只在真实用户决策是下一步时使用。",
    buildSharedAgentContext(input),
    buildMainAgentExecutionProtocol(input, "options"),
    buildThreeChoiceProtocol(),
    "# 输出要求",
    "只在真实用户决策是下一步时提交一个问题和三个答案。",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本任务产出的用户可见字段包括：roundIntent、decisionRationale、options[].label、options[].description 和 options[].impact。",
    "decisionRationale 写清楚为什么现在需要用户选择，例如方向未定、材料取舍冲突、多个执行结果都可行或用户输入是当前 blocker。",
    "roundIntent 必须是一个用户可以直接回答的问题。",
    "options[].label 写这个答案的短标题。",
    "options[].description 写这个答案代表的取舍、事实口径或处理方式。",
    "options[].impact 写选择后会让后续生成获得什么确定性。",
    "每个答案都要有短标题、具体说明和预计影响。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。"
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

Replace `buildTreeNextStepInstructions()` opening and rules with:

```ts
export function buildTreeNextStepInstructions(input: SharedAgentContextInput) {
  return [
    "# 主 agent 任务",
    "你负责在用户选择一个答案之后，决定下一步是继续提问、提交草稿任务，还是完成。",
    "你可以使用已启用 Skills、工具和 subagent 做必要的判断或补充工作。",
    buildSharedAgentContext(input),
    buildMainAgentExecutionProtocol(input, "next-step"),
    buildThreeChoiceProtocol(),
    "# 输出要求",
    "只返回结构化结果。",
    "action 只能是 options、draft 或 complete。",
    "当 action=options 时，roundIntent 必须是一个新问题，decisionRationale 必须说明为什么需要用户继续选择，并必须返回 options[].label、options[].description 和 options[].impact；不需要输出 id 或 kind，系统会自动把三个答案映射为 a、b、c。",
    "当 action=draft 时，不返回 options；只返回 roundIntent。",
    "当 action=complete 时，不返回 options；只返回 roundIntent。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。"
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

Add helper functions above `finalSubmitExecutionRules()`:

```ts
function buildMainAgentExecutionProtocol(input: SharedAgentContextInput, target: "draft" | "next-step" | "options") {
  return [
    "# actual-work 执行协议",
    "先判断当前最有用的一步工作：直接处理、调用普通工具、调用 run_subagent_template、调用 run_temporary_subagent、提交草稿、提交发布包、完成，或在用户输入是 blocker 时发起三选一。",
    "已启用 Skills 提供角色判断；它们不是固定 agent。按 Skill 的角色职责和委托建议决定是否调用 subagent。",
    "可调用 run_subagent_template 处理常见边界任务；可调用 run_temporary_subagent 处理没有合适模板的一次性边界任务。",
    "调用 subagent 前传入短任务、最小上下文、期望输出和必要约束；拿到结果后由你整合判断。",
    "如果可以直接提交有用结果，就提交结果；如果真实用户决策是下一步，提交三选一并写 decisionRationale。",
    ...finalSubmitExecutionRules(input, target)
  ].join("\n");
}

function buildThreeChoiceProtocol() {
  return [
    "# 三选一协议",
    "三选一只用于真实用户决策。",
    "适用情况包括：创作方向阻塞、实际工作产生多个可行方向、需要用户选择读者/角度/素材取舍/改写力度/发布方向，或用户输入是当前 blocker。",
    "三个答案必须回应同一个 roundIntent，不能是三个彼此无关的问题。",
    "提交三选一时必须写 decisionRationale，说明为什么当前需要用户决策。"
  ].join("\n");
}
```

Use `buildMainAgentExecutionProtocol(input, "draft")`, `buildMainAgentExecutionProtocol(input, "options")`, and `buildMainAgentExecutionProtocol(input, "next-step")` in the three instruction builders.

- [ ] **Step 4: Delete hidden workflow files**

Run:

```bash
git rm src/lib/ai/content-workflow.ts src/lib/ai/content-workflow.test.ts
```

- [ ] **Step 5: Stop filtering tree-agent Skills by writer/editor target**

In `src/lib/ai/mastra-executor.ts`, remove `skillsForTarget` from the domain import.

Replace `contextForDirectorParts()` with:

```ts
function contextForDirectorParts(
  parts: DirectorInputParts,
  context: Partial<AgentExecutionContextOverride> = {}
): SharedAgentContextInput {
  return {
    rootSummary: parts.rootSummary,
    learnedSummary: parts.learnedSummary,
    enabledSkills: parts.enabledSkills.map(normalizeSkill),
    longTermMemory: context.longTermMemory,
    availableSkillSummaries: context.availableSkillSummaries,
    subagentTemplateSummaries: context.subagentTemplateSummaries,
    toolSummaries: context.toolSummaries
  };
}
```

Update `AgentExecutionContextOverride`:

```ts
type AgentExecutionContextOverride = Pick<
  SharedAgentContextInput,
  "availableSkillSummaries" | "longTermMemory" | "subagentTemplateSummaries" | "toolSummaries"
>;
```

Update `executionContextForDirectorParts()` signature:

```ts
async function executionContextForDirectorParts(
  parts: DirectorInputParts,
  context: Partial<AgentExecutionContextOverride> = {},
  skipRuntimeTools = false
)
```

Change its first line to:

```ts
  const baseContext = contextForDirectorParts(parts, context);
```

Update call sites:

```ts
const executionContext = await executionContextForDirectorParts(parts, context, Boolean(treeDraftAgent));
```

```ts
const executionContext = await executionContextForDirectorParts(parts, context, Boolean(treeNextStepAgent));
```

```ts
const executionContext = await executionContextForDirectorParts(parts, context, Boolean(treeOptionsAgent));
```

- [ ] **Step 6: Run prompt tests**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/ai/mastra-context.ts src/lib/ai/mastra-context.test.ts src/lib/ai/mastra-executor.ts src/lib/ai/content-workflow.ts src/lib/ai/content-workflow.test.ts
git commit -m "feat: add main agent orchestration prompt"
```

---

### Task 4: Executor Subagent Tools And Actual-Work Retry

**Files:**
- Modify: `src/lib/domain.ts`
- Modify: `src/lib/ai/mastra-executor.ts`
- Modify: `src/lib/ai/mastra-executor.test.ts`

- [ ] **Step 1: Add schema support for option decision rationale**

In `src/lib/domain.ts`, add optional `decisionRationale` to `DirectorOptionsOutputSchema`:

```ts
export const DirectorOptionsOutputSchema = z.object({
  decisionRationale: z.string().min(1).optional(),
  roundIntent: z.string().min(1),
  options: z.array(BranchOptionSchema).length(3, "AI suggestions must include exactly three items.")
}).superRefine((output, context) => {
```

Add optional `decisionRationale` to `DirectorNextStepOptionsSchema`:

```ts
const DirectorNextStepOptionsSchema = z.object({
  action: z.literal("options").default("options"),
  decisionRationale: z.string().min(1).optional(),
  roundIntent: z.string().min(1),
  options: z
```

- [ ] **Step 2: Add executor tests for all Skills and subagent tools**

In `src/lib/ai/mastra-executor.test.ts`, extend `mocks`:

```ts
  createSubagentRuntimeTools: vi.fn()
```

Add the mock:

```ts
vi.mock("./subagent-runtime", () => ({
  createSubagentRuntimeTools: mocks.createSubagentRuntimeTools
}));
```

In `beforeEach()`, add:

```ts
  mocks.createSubagentRuntimeTools.mockReturnValue({
    subagentTemplateSummaries: ["- material-search（素材搜索）：查找候选来源。"],
    toolSummaries: [
      "run_subagent_template：调用预创建 subagent 模板。",
      "run_temporary_subagent：创建一次性 subagent。"
    ],
    tools: {
      run_subagent_template: { id: "run_subagent_template", execute: vi.fn() },
      run_temporary_subagent: { id: "run_temporary_subagent", execute: vi.fn() }
    }
  });
```

Update the two compatibility tests:

```ts
it("passes all enabled skills to the draft agent", async () => {
```

Expect draft prompt to contain all three fixture Skills:

```ts
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.stringContaining("自然短句")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.stringContaining("逻辑链审查")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:draft]",
  expect.stringContaining("标题不要夸张")
);
```

Update the options test name:

```ts
it("passes all enabled skills and subagent tools to the options agent", async () => {
```

Expect options prompt to include all Skills and template/tool summaries:

```ts
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("自然短句")
);
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
  expect.stringContaining("material-search")
);
expect(consoleInfoSpy).toHaveBeenCalledWith(
  "[treeable:mastra-prompt:options]",
  expect.stringContaining("run_subagent_template")
);
```

Remove expectations that options excludes writer Skills or includes `# 内容工作流阶段`.

- [ ] **Step 3: Add executor tests for actual-work retry**

In `src/lib/ai/mastra-executor.test.ts`, add this runtime options test near other runtime final-submit tests:

```ts
  it("retries runtime options that submit choices without work or a blocker rationale", async () => {
    const firstObject = {
      roundIntent: "选择下一步",
      options: [
        { id: "a", label: "补例子", description: "补一个例子。", impact: "更具体。", kind: "explore" },
        { id: "b", label: "改开头", description: "换一个开头。", impact: "更好进入。", kind: "reframe" },
        { id: "c", label: "收标题", description: "整理标题。", impact: "更接近发布。", kind: "finish" }
      ]
    };
    const finalObject = {
      decisionRationale: "当前 seed 缺少目标读者，用户输入是 blocker。",
      roundIntent: "这篇更想写给谁？",
      options: [
        { id: "a", label: "写给新手", description: "先解释背景。", impact: "读者进入更容易。", kind: "explore" },
        { id: "b", label: "写给同行", description: "直接讲判断。", impact: "表达更高效。", kind: "deepen" },
        { id: "c", label: "写给团队", description: "变成内部共识。", impact: "更可执行。", kind: "reframe" }
      ]
    };
    const stream = vi
      .fn()
      .mockResolvedValueOnce({
        fullStream: async function* () {
          yield {
            type: "tool-call",
            payload: {
              toolCallId: "submit-1",
              toolName: "submit_tree_options",
              args: firstObject
            }
          };
        },
        object: Promise.resolve(undefined)
      })
      .mockResolvedValueOnce({
        fullStream: async function* () {
          yield {
            type: "tool-call",
            payload: {
              toolCallId: "submit-2",
              toolName: "submit_tree_options",
              args: finalObject
            }
          };
        },
        object: Promise.resolve(undefined)
      });
    mocks.agentConstructor.mockImplementationOnce(function Agent(options) {
      return {
        options,
        stream,
        generate: vi.fn()
      };
    });

    await expect(
      streamTreeOptions({
        parts: directorParts,
        env: { KIMI_API_KEY: "token" }
      })
    ).resolves.toMatchObject({
      decisionRationale: finalObject.decisionRationale,
      roundIntent: finalObject.roundIntent
    });

    expect(stream).toHaveBeenCalledTimes(2);
    const retryMessages = stream.mock.calls[1]?.[0] as Array<{ content: string; role: string }>;
    expect(retryMessages.at(-1)?.content).toContain("You must do actual work before ending this turn");
    expect(retryMessages.at(-1)?.content).toContain("clear blocker rationale");
  });
```

Add acceptance when a non-final subagent/tool runs first:

```ts
  it("accepts runtime options after a subagent tool call even without a blocker rationale", async () => {
    const finalObject = {
      roundIntent: "选择可用素材方向",
      options: [
        { id: "a", label: "用团队案例", description: "从内部协作进入。", impact: "更真实。", kind: "explore" },
        { id: "b", label: "用行业案例", description: "从外部趋势进入。", impact: "更有背景。", kind: "deepen" },
        { id: "c", label: "用反例", description: "先写失败做法。", impact: "冲突更强。", kind: "reframe" }
      ]
    };
    const stream = vi.fn(async () => ({
      fullStream: async function* () {
        yield {
          type: "tool-result",
          payload: {
            toolCallId: "subagent-1",
            toolName: "run_subagent_template",
            result: { ok: true, result: "找到三类素材。" }
          }
        };
        yield {
          type: "tool-call",
          payload: {
            toolCallId: "submit-1",
            toolName: "submit_tree_options",
            args: finalObject
          }
        };
      },
      object: Promise.resolve(undefined)
    }));
    mocks.agentConstructor.mockImplementationOnce(function Agent(options) {
      return {
        options,
        stream,
        generate: vi.fn()
      };
    });

    await expect(
      streamTreeOptions({
        parts: directorParts,
        env: { KIMI_API_KEY: "token" }
      })
    ).resolves.toMatchObject({
      roundIntent: finalObject.roundIntent
    });

    expect(stream).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 4: Integrate subagent runtime tools**

In `src/lib/ai/mastra-executor.ts`, import:

```ts
import { createSubagentRuntimeTools } from "./subagent-runtime";
```

Update `executionContextForDirectorParts()` to receive `env`:

```ts
async function executionContextForDirectorParts(
  parts: DirectorInputParts,
  env: Record<string, string | undefined> | undefined,
  context: Partial<AgentExecutionContextOverride> = {},
  skipRuntimeTools = false
)
```

Update call sites to pass `env` as the second argument:

```ts
const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeDraftAgent));
```

Inside `executionContextForDirectorParts()`, immediately after the `const runtime = await createSkillRuntimeTools(baseContext.enabledSkills);` line, add:

```ts
  const subagentRuntime = createSubagentRuntimeTools({ env });
```

Update MCP creation:

```ts
  const mcpRuntime = await createMcpRuntimeTools({
    existingTools: {
      ...(runtime.tools ?? {}),
      ...(subagentRuntime.tools ?? {})
    }
  });
```

Update `tools`:

```ts
  const tools = {
    ...(runtime.tools ?? {}),
    ...(subagentRuntime.tools ?? {}),
    ...(mcpRuntime.tools ?? {})
  };
```

Update `agentContext`:

```ts
      subagentTemplateSummaries: [
        ...(baseContext.subagentTemplateSummaries ?? []),
        ...subagentRuntime.subagentTemplateSummaries
      ],
      toolSummaries: [
        ...(baseContext.toolSummaries ?? []),
        ...runtime.toolSummaries,
        ...subagentRuntime.toolSummaries,
        ...mcpRuntime.toolSummaries
      ]
```

- [ ] **Step 5: Add actual-work validation**

In `src/lib/ai/mastra-executor.ts`, add this constant near submit tool constants:

```ts
const ACTUAL_WORK_RETRY_MESSAGE =
  "You must do actual work before ending this turn. Call a tool or subagent, submit an updated draft or publish package, mark the task complete, or ask the user through three choices with a clear blocker rationale.";
```

In `parseRuntimeReActStreamOutput()`, after successfully parsing `summary.submittedOutput`, insert:

```ts
      assertMeaningfulRuntimeAction({ output: parsed, summary, target });
```

Also after `const parsed = schema.parse(output);` in the structured-success block, insert:

```ts
    assertMeaningfulRuntimeAction({ output: parsed, summary, target });
```

Add helper functions near `finalSubmitToolRequiredError()`:

```ts
function assertMeaningfulRuntimeAction({
  output,
  summary,
  target
}: {
  output: unknown;
  summary: RuntimeToolStreamSummary;
  target: RuntimeSubmitTarget;
}) {
  if (hasNonFinalToolActivity(summary)) return;
  if (target === "draft") return;
  if (target === "next-step" && nextStepActionIsMeaningful(output)) return;
  if (hasDecisionRationale(output)) return;

  throw new ZodError([
    {
      code: "custom",
      path: ["decisionRationale"],
      message: ACTUAL_WORK_RETRY_MESSAGE
    }
  ]);
}

function hasNonFinalToolActivity(summary: RuntimeToolStreamSummary) {
  return summary.streamChunks.some((chunk) => Boolean(chunk.toolName && !isFinalSubmitToolName(chunk.toolName)));
}

function nextStepActionIsMeaningful(output: unknown) {
  if (!isObjectRecord(output)) return false;
  const action = output.action;
  return action === "draft" || action === "complete";
}

function hasDecisionRationale(output: unknown) {
  return isObjectRecord(output) && typeof output.decisionRationale === "string" && output.decisionRationale.trim().length > 0;
}
```

The file already has `isFinalSubmitToolName()` and `isObjectRecord()` helpers; reuse those existing helpers.

- [ ] **Step 6: Run executor tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/lib/domain.ts src/lib/ai/mastra-executor.ts src/lib/ai/mastra-executor.test.ts
git commit -m "feat: enforce subagent actual-work flow"
```

---

### Task 5: Skill UI Copy And Full Verification

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
  { appliesTo: "writer", title: "草稿工作", effect: "作用：内容更新" },
  { appliesTo: "editor", title: "判断工作", effect: "作用：方向与检查" },
  { appliesTo: "both", title: "内容团队", effect: "作用：全程" }
] as const;
```

- [ ] **Step 2: Update SkillPicker tests**

In `src/components/skills/SkillPicker.test.tsx`, replace group expectations:

```ts
expect(screen.getByRole("group", { name: "草稿工作" })).toBeInTheDocument();
expect(screen.getByRole("group", { name: "判断工作" })).toBeInTheDocument();
expect(screen.getByRole("group", { name: "内容团队" })).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "草稿工作" })).getByText("作用：内容更新")).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "判断工作" })).getByText("作用：方向与检查")).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "内容团队" })).getByText("作用：全程")).toBeInTheDocument();
expect(within(screen.getByRole("group", { name: "判断工作" })).getByRole("checkbox", { name: /逻辑链审查/ })).toBeChecked();
```

- [ ] **Step 3: Update SkillLibraryPanel effect copy**

In `src/components/skills/SkillLibraryPanel.tsx`, keep the underlying `appliesTo` storage but update user-facing labels:

```tsx
<span>影响内容更新</span>
```

```tsx
<span>影响方向判断</span>
```

Update `effectLabelFor()`:

```ts
function effectLabelFor(appliesTo: Skill["appliesTo"]) {
  if (appliesTo === "writer") return "作用：内容更新";
  if (appliesTo === "editor") return "作用：方向判断";
  return "作用：全程";
}
```

Update `groupSkills()`:

```ts
function groupSkills(skills: Skill[]) {
  const groups = [
    ["内容更新", "writer"],
    ["方向判断", "editor"],
    ["全程", "both"]
  ] as const;

  return groups
    .map(([label, appliesTo]) => [label, skills.filter((skill) => skill.appliesTo === appliesTo)] as const)
    .filter(([, groupSkills]) => groupSkills.length > 0);
}
```

- [ ] **Step 4: Update component tests**

In `src/components/skills/SkillLibraryPanel.test.tsx`, replace:

```ts
await userEvent.click(screen.getByRole("checkbox", { name: "影响建议" }));
```

with:

```ts
await userEvent.click(screen.getByRole("checkbox", { name: "影响方向判断" }));
```

Replace:

```ts
expect(within(systemItem).getByText("影响：建议")).toBeInTheDocument();
```

with:

```ts
expect(within(systemItem).getByText("作用：方向判断")).toBeInTheDocument();
```

Replace:

```ts
expect(screen.getByRole("checkbox", { name: "影响建议" })).toBeChecked();
```

with:

```ts
expect(screen.getByRole("checkbox", { name: "影响方向判断" })).toBeChecked();
```

In `src/components/root-memory/RootMemorySetup.test.tsx`, replace every group-name assertion for `"审稿重点"` with `"判断工作"`:

```ts
expect(screen.queryByRole("group", { name: "判断工作" })).not.toBeInTheDocument();
expect(screen.getByRole("group", { name: "判断工作" })).toBeInTheDocument();
```

- [ ] **Step 5: Run component tests**

Run:

```bash
npm test -- src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Search for obsolete workflow text**

Run:

```bash
rg -n "内容工作流阶段|content-workflow|澄清意图|收口发布|系统写作者|系统审核者" src config
```

Expected: no output.

- [ ] **Step 7: Run focused implementation tests**

Run:

```bash
npm test -- src/lib/defaults.test.ts src/lib/db/repository.test.ts src/lib/ai/subagent-templates.test.ts src/lib/ai/subagent-runtime.test.ts src/lib/ai/mastra-context.test.ts src/lib/ai/mastra-executor.test.ts src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run adjacent tests**

Run:

```bash
npm test -- src/lib/inspirations.test.ts src/app/api/inspirations/route.test.ts src/app/api/sessions/[sessionId]/options/route.test.ts src/app/api/sessions/[sessionId]/draft/generate/stream/route.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit Task 5**

```bash
git add src/components/skills/SkillPicker.tsx src/components/skills/SkillPicker.test.tsx src/components/skills/SkillLibraryPanel.tsx src/components/skills/SkillLibraryPanel.test.tsx src/components/root-memory/RootMemorySetup.test.tsx
git commit -m "chore: align skill UI with workflow roles"
```

---

## Self-Review Notes

- Spec coverage: role Skills, delegation guidance, precreated templates, temporary subagents, main-agent orchestration, three-choice protocol, actual-work retry, and fresh defaults are all mapped to tasks.
- No old role-agent binding is introduced: `策划`, `资料员`, `写手`, `审稿`, and `发布编辑` stay as Skills; subagent templates are separate tools.
- The current `appliesTo` field is retained as storage/UI compatibility, but tree-agent prompt routing stops filtering Skills by target.
- The runtime no-op rule is implemented where the executor can observe tool activity: runtime streams with final submit tools.
- The plan intentionally leaves the superseded earlier plan in place with its warning instead of deleting prior documentation.
