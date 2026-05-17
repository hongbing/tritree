# Three-Choice Content Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tritree's existing three-choice suggestions stage-aware for content creation while preserving the current mobile-friendly choice loop.

**Architecture:** Add a focused prompt-instruction module for soft content workflow stages, then inject those instructions into the options agent only. Keep the draft agent unchanged so selected options continue to act as writing goals rather than exposed workflow metadata.

**Tech Stack:** TypeScript, Next.js App Router, Mastra agent prompts, Vitest.

---

## Scope Check

This plan implements the first rollout step from the approved design: prompt-only stage-aware options generation. It does not add database fields, UI stage chips, or persisted workflow metadata. Those are separate product increments after the prompt behavior proves useful.

## File Structure

- Create `src/lib/ai/content-workflow.ts`: owns the content workflow stage names, stage-selection rules, option-writing rules, and exported instruction builder.
- Create `src/lib/ai/content-workflow.test.ts`: tests the stage instruction module directly.
- Modify `src/lib/ai/mastra-context.ts`: imports the workflow instructions and inserts them into the options-agent instructions.
- Modify `src/lib/ai/mastra-context.test.ts`: verifies options instructions include workflow staging and draft instructions do not.
- Modify `src/lib/ai/mastra-executor.test.ts`: verifies the options runtime prompt contains the workflow instructions when streamed through the executor.

### Task 1: Add Content Workflow Instruction Module

**Files:**
- Create: `src/lib/ai/content-workflow.ts`
- Test: `src/lib/ai/content-workflow.test.ts`

- [ ] **Step 1: Write the failing module tests**

Create `src/lib/ai/content-workflow.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import {
  CONTENT_WORKFLOW_STAGES,
  buildContentWorkflowOptionInstructions
} from "./content-workflow";

describe("content workflow option instructions", () => {
  it("lists all soft content workflow stages used by the options agent", () => {
    expect(CONTENT_WORKFLOW_STAGES).toEqual([
      "clarify-intent",
      "choose-angle",
      "organize-material",
      "write-rewrite",
      "review-repair",
      "finish-publish"
    ]);
  });

  it("teaches the options agent to choose a stage before writing one question and three answers", () => {
    const instructions = buildContentWorkflowOptionInstructions();

    expect(instructions).toContain("# 内容工作流阶段");
    expect(instructions).toContain("这些阶段是内部判断线索，不要把英文阶段名暴露给用户");
    expect(instructions).toContain("澄清意图");
    expect(instructions).toContain("选择角度");
    expect(instructions).toContain("组织材料");
    expect(instructions).toContain("写作或改写");
    expect(instructions).toContain("审稿修补");
    expect(instructions).toContain("收口发布");
    expect(instructions).toContain("先判断当前内容最适合哪个阶段");
    expect(instructions).toContain("为该阶段生成一个 roundIntent 问题");
    expect(instructions).toContain("三个 options 必须是对同一个 roundIntent 的三个答案");
    expect(instructions).toContain("如果 seed 缺少读者、目的或期望效果，优先澄清意图");
    expect(instructions).toContain("如果草稿已经连贯且接近可发布，优先收口发布");
  });

  it("keeps the instruction product-neutral and compatible with existing fields", () => {
    const instructions = buildContentWorkflowOptionInstructions();

    expect(instructions).toContain("只使用现有输出字段表达判断：roundIntent、options[].label、options[].description、options[].impact");
    expect(instructions).toContain("description 写选择背后的诊断、取舍或处理口径");
    expect(instructions).toContain("impact 写选择后会让下一稿获得什么确定性");
    expect(instructions).not.toContain("workflow_stage");
    expect(instructions).not.toContain("stage_reason");
    expect(instructions).not.toContain("Superpowers");
    expect(instructions).not.toContain("三选一");
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npm test -- src/lib/ai/content-workflow.test.ts
```

Expected: FAIL because `src/lib/ai/content-workflow.ts` does not exist.

- [ ] **Step 3: Implement the instruction module**

Create `src/lib/ai/content-workflow.ts` with this content:

```ts
export const CONTENT_WORKFLOW_STAGES = [
  "clarify-intent",
  "choose-angle",
  "organize-material",
  "write-rewrite",
  "review-repair",
  "finish-publish"
] as const;

export type ContentWorkflowStage = (typeof CONTENT_WORKFLOW_STAGES)[number];

type StageInstruction = {
  id: ContentWorkflowStage;
  label: string;
  when: string;
  questionFocus: string;
  optionExamples: string[];
};

const STAGE_INSTRUCTIONS: StageInstruction[] = [
  {
    id: "clarify-intent",
    label: "澄清意图",
    when: "seed 缺少读者、目的、想让读者产生的感受或行动，或当前方向还不清楚。",
    questionFocus: "让用户先确认读者、目的、表达类型或期望效果。",
    optionExamples: ["写给新手", "写给同行", "写给朋友"]
  },
  {
    id: "choose-angle",
    label: "选择角度",
    when: "主题已经明确，但还缺少有吸引力的切入点、开头承诺或表达角度。",
    questionFocus: "让用户选择从场景、观点、冲突、反差或读者问题中的哪一类角度切入。",
    optionExamples: ["从真实场景开头", "先亮出观点", "用一个反差切入"]
  },
  {
    id: "organize-material",
    label: "组织材料",
    when: "草稿里有可用素材，但顺序散、主线弱、段落职责不清或旁支太多。",
    questionFocus: "让用户决定材料怎样排序、删减、合并或重组。",
    optionExamples: ["按时间顺序整理", "先问题后方法", "删掉旁支内容"]
  },
  {
    id: "write-rewrite",
    label: "写作或改写",
    when: "意图和结构已经足够明确，下一步应该生成更强的正文版本。",
    questionFocus: "让用户选择下一稿的写作动作、改动幅度或表达方式。",
    optionExamples: ["补一个例子", "压成短句", "换成更锋利的表达"]
  },
  {
    id: "review-repair",
    label: "审稿修补",
    when: "草稿已经存在，但清晰度、可信度、读者进入感、事实风险或标题承诺更值得优先处理。",
    questionFocus: "让用户选择当前最影响作品成立的质量问题。",
    optionExamples: ["补清楚因果", "降低断言风险", "增强读者进入感"]
  },
  {
    id: "finish-publish",
    label: "收口发布",
    when: "草稿已经连贯且接近可发布，继续大改的收益低于收束、压缩、检查和平台化交付。",
    questionFocus: "让用户选择最后的发布前处理方式。",
    optionExamples: ["检查标题承诺", "生成发布版", "做最后压缩"]
  }
];

export function buildContentWorkflowOptionInstructions() {
  return [
    "# 内容工作流阶段",
    "这些阶段是内部判断线索，不要把英文阶段名暴露给用户，也不要让用户手动选择阶段。",
    "每轮先判断当前内容最适合哪个阶段，再为该阶段生成一个 roundIntent 问题。",
    "三个 options 必须是对同一个 roundIntent 的三个答案，不是三个互不相关的问题。",
    "",
    ...STAGE_INSTRUCTIONS.flatMap((stage) => [
      `## ${stage.label}`,
      `适用：${stage.when}`,
      `问题焦点：${stage.questionFocus}`,
      `可选动作示例：${stage.optionExamples.join("、")}`
    ]),
    "",
    "# 阶段选择规则",
    "如果 seed 缺少读者、目的或期望效果，优先澄清意图。",
    "如果主题明确但入口不强，优先选择角度。",
    "如果素材有价值但顺序散乱，优先组织材料。",
    "如果用户刚确认了清楚的写作方向，优先写作或改写。",
    "如果草稿已有雏形但存在清晰度、可信度或读者进入问题，优先审稿修补。",
    "如果草稿已经连贯且接近可发布，优先收口发布。",
    "阶段是判断线索，不是硬性流程；如果用户改变方向或当前文本暴露出缺失信息，可以回到更早阶段。",
    "",
    "# 选项表达规则",
    "只使用现有输出字段表达判断：roundIntent、options[].label、options[].description、options[].impact。",
    "roundIntent 写当前最值得用户回答的一个具体问题。",
    "options[].label 写简短、可点击的动作短句。",
    "description 写选择背后的诊断、取舍或处理口径。",
    "impact 写选择后会让下一稿获得什么确定性。",
    "如果三个选择都显得弱，重新选择更有价值的阶段，而不是硬凑三个低价值答案。"
  ].join("\n");
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run:

```bash
npm test -- src/lib/ai/content-workflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/ai/content-workflow.ts src/lib/ai/content-workflow.test.ts
git commit -m "feat: add content workflow prompt instructions"
```

Expected: commit succeeds.

### Task 2: Inject Workflow Instructions Into Options Prompt

**Files:**
- Modify: `src/lib/ai/mastra-context.ts`
- Modify: `src/lib/ai/mastra-context.test.ts`

- [ ] **Step 1: Write the failing context tests**

In `src/lib/ai/mastra-context.test.ts`, update the first test in `describe("agent instructions", ...)` named `asks the director to turn diagnosis into one question and three answers` by adding these assertions after the existing `expect(instructions).toContain("不要返回独立审查报告");` assertion:

```ts
    expect(instructions).toContain("# 内容工作流阶段");
    expect(instructions).toContain("每轮先判断当前内容最适合哪个阶段");
    expect(instructions).toContain("为该阶段生成一个 roundIntent 问题");
    expect(instructions).toContain("澄清意图");
    expect(instructions).toContain("选择角度");
    expect(instructions).toContain("组织材料");
    expect(instructions).toContain("写作或改写");
    expect(instructions).toContain("审稿修补");
    expect(instructions).toContain("收口发布");
    expect(instructions).toContain("只使用现有输出字段表达判断：roundIntent、options[].label、options[].description、options[].impact");
```

In the `uses separate writer and director roles without leaking the tree choice mechanic` test, add these assertions after `const optionsInstructions = buildTreeOptionsInstructions(input);`:

```ts
    expect(draftInstructions).not.toContain("# 内容工作流阶段");
    expect(draftInstructions).not.toContain("澄清意图");
    expect(draftInstructions).not.toContain("只使用现有输出字段表达判断");
```

- [ ] **Step 2: Run context tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: FAIL because `buildTreeOptionsInstructions` does not include the workflow instructions yet.

- [ ] **Step 3: Import the workflow instruction builder**

At the top of `src/lib/ai/mastra-context.ts`, add this import after the existing `import type { Skill } from "@/lib/domain";` line:

```ts
import { buildContentWorkflowOptionInstructions } from "./content-workflow";
```

- [ ] **Step 4: Insert workflow instructions into the options prompt**

In `src/lib/ai/mastra-context.ts`, update `buildTreeOptionsInstructions` so the array includes `buildContentWorkflowOptionInstructions()` immediately after `buildSharedAgentContext(input),`.

The start of the function should look like this:

```ts
export function buildTreeOptionsInstructions(input: SharedAgentContextInput) {
  return [
    "# 总导演任务",
    "你是一位经验丰富的澄清问题设计者。",
    "你的任务不是续写正文，而是阅读初始内容、修改历程和当前内容，提出一个当前最值得让用户回答的问题，并给出三个可选择答案。",
    buildSharedAgentContext(input),
    buildContentWorkflowOptionInstructions(),
    "# 本任务执行规则",
    "把历史当作一篇文章的编辑记录：初始内容是什么，经过了哪些修改，现在的内容走到了哪里。",
```

Do not add this workflow instruction builder to `buildTreeDraftInstructions`.

- [ ] **Step 5: Run context tests to verify they pass**

Run:

```bash
npm test -- src/lib/ai/mastra-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/lib/ai/mastra-context.ts src/lib/ai/mastra-context.test.ts
git commit -m "feat: make option prompts stage aware"
```

Expected: commit succeeds.

### Task 3: Verify Executor Prompt Integration

**Files:**
- Modify: `src/lib/ai/mastra-executor.test.ts`

- [ ] **Step 1: Write the failing executor assertion**

In `src/lib/ai/mastra-executor.test.ts`, update the test named `passes editor and shared skills to the options agent` by adding this assertion after the existing `expect(consoleInfoSpy).toHaveBeenCalledWith("[treeable:mastra-prompt:options]", expect.not.stringContaining("自然短句"));` block:

```ts
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[treeable:mastra-prompt:options]",
      expect.stringContaining("# 内容工作流阶段")
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[treeable:mastra-prompt:options]",
      expect.stringContaining("如果草稿已经连贯且接近可发布，优先收口发布")
    );
```

Update the test named `passes writer and shared skills to the draft agent` by adding this assertion after the existing `expect(consoleInfoSpy).toHaveBeenCalledWith("[treeable:mastra-prompt:draft]", expect.not.stringContaining("逻辑链审查"));` block:

```ts
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[treeable:mastra-prompt:draft]",
      expect.not.stringContaining("# 内容工作流阶段")
    );
```

- [ ] **Step 2: Run executor tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts
```

Expected: PASS if Task 2 is complete. If run before Task 2, this test fails because the options prompt has no workflow instructions.

- [ ] **Step 3: Commit Task 3**

Run:

```bash
git add src/lib/ai/mastra-executor.test.ts
git commit -m "test: cover stage-aware option prompt execution"
```

Expected: commit succeeds.

### Task 4: Full Verification

**Files:**
- No file changes.

- [ ] **Step 1: Run focused AI prompt tests**

Run:

```bash
npm test -- src/lib/ai/content-workflow.test.ts src/lib/ai/mastra-context.test.ts src/lib/ai/mastra-executor.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files.

## Self-Review Notes

- Spec coverage: This plan covers the prompt-only rollout, keeps exactly-three options, keeps existing fields, improves early/middle/late suggestion logic, and avoids schema/UI changes in this increment.
- Placeholder scan: The plan uses exact paths, exact test commands, and complete code snippets for new files.
- Type consistency: `ContentWorkflowStage`, `CONTENT_WORKFLOW_STAGES`, and `buildContentWorkflowOptionInstructions` are defined in Task 1 and used consistently in Tasks 2 and 3.
