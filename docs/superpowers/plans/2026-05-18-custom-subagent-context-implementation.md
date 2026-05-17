# Custom Subagent Context Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custom subagents isolated tools that receive runtime-projected shared context, with the latest draft as the sole draft body in the default subagent view.

**Architecture:** Add a generic context projection module that converts `DirectorInputParts` into a scoped agent snapshot. Wire subagent runtime tools to build their own context from that snapshot, so the main agent only supplies compact task arguments. Keep main agent prompts generic and preserve current stream progress display.

**Tech Stack:** TypeScript, Next.js 16, Mastra agents/tools, Zod, Vitest.

---

## File Structure

- Create `src/lib/ai/context-projection.ts`
  - Owns `ContextViewPolicy`, `SUBAGENT_CONTEXT_POLICY`, `ProjectedAgentContext`, `projectAgentContext`, and `formatProjectedAgentContext`.
  - Depends on `DirectorInputParts` only, keeping this first implementation close to the existing AI execution boundary.

- Create `src/lib/ai/context-projection.test.ts`
  - Proves the default subagent policy keeps the current/latest draft as the sole draft body.
  - Proves recent user feedback and enabled skills are included through explicit projection fields.

- Modify `src/lib/ai/subagent-runtime.ts`
  - Adds `contextSource` and `contextPolicy` options to `createSubagentRuntimeTools`.
  - Removes large `context` input from `run_custom_subagent`.
  - Uses the same projected context path for template and custom subagents.
  - Updates subagent instructions to describe isolated execution responsibility.

- Modify `src/lib/ai/subagent-runtime.test.ts`
  - Updates tool schema expectations and task runner assertions.
  - Proves the subagent receives projected context, not caller-written context.

- Modify `src/lib/ai/mastra-executor.ts`
  - Passes `parts` into `createSubagentRuntimeTools` as `contextSource`.

- Modify `src/lib/ai/mastra-executor.test.ts`
  - Proves executor creates subagent tools with the current director parts as projection source.
  - Updates tool-call fixtures to omit `context` for custom/template calls where relevant.

- Modify `src/lib/ai/mastra-context.ts`
  - Updates generic ReAct protocol copy so the main agent supplies compact subagent task arguments.

- Modify `src/lib/ai/mastra-context.test.ts`
  - Proves the main prompt still treats subagent output as a checked tool result.
  - Proves prompt text points to runtime-supplied context rather than caller-written context.

---

### Task 1: Add Context Projection Module

**Files:**
- Create: `src/lib/ai/context-projection.ts`
- Create: `src/lib/ai/context-projection.test.ts`

- [ ] **Step 1: Write failing context projection tests**

Create `src/lib/ai/context-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/domain";
import type { DirectorInputParts } from "./prompts";
import {
  SUBAGENT_CONTEXT_POLICY,
  formatProjectedAgentContext,
  projectAgentContext
} from "./context-projection";

const skill = {
  id: "skill-1",
  title: "审稿",
  category: "检查",
  description: "检查逻辑。",
  prompt: "找出最关键的逻辑断点。",
  appliesTo: "both",
  isSystem: true,
  defaultEnabled: true,
  isArchived: false,
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z"
} satisfies Skill;

function parts(overrides: Partial<DirectorInputParts> = {}): DirectorInputParts {
  return {
    artifactContext: "产物类型：社媒草稿。",
    rootSummary: "Seed：写 AI PM 的真实困境。",
    learnedSummary: "用户喜欢真实、克制的表达。",
    currentDraft: [
      "标题：最新标题",
      "正文：这是最新 draft 正文。",
      "话题：#AI",
      "配图提示：白板"
    ].join("\n"),
    pathSummary: "第 1 版：旧方向",
    foldedSummary: "",
    selectedOptionLabel: "补论证：增加一个真实冲突。",
    enabledSkills: [skill],
    messages: [
      { role: "assistant", content: "历史草稿正文：这是旧 draft 正文。" },
      { role: "user", content: "用户补充：别写成教程。" }
    ],
    ...overrides
  };
}

describe("projectAgentContext", () => {
  it("projects the latest draft as the sole draft body for the default subagent policy", () => {
    const snapshot = projectAgentContext(parts(), SUBAGENT_CONTEXT_POLICY);

    expect(snapshot.currentArtifact).toEqual({
      type: "draft",
      value: expect.stringContaining("这是最新 draft 正文。")
    });
    expect(snapshot.currentArtifact?.value).not.toContain("这是旧 draft 正文");
    expect(snapshot.selectedDirection).toBe("补论证：增加一个真实冲突。");
    expect(snapshot.enabledSkills.map((item) => item.title)).toEqual(["审稿"]);
    expect(snapshot.recentUserFeedback).toEqual(["用户补充：别写成教程。"]);
  });

  it("formats projected context with stable section labels", () => {
    const text = formatProjectedAgentContext(projectAgentContext(parts(), SUBAGENT_CONTEXT_POLICY));

    expect(text).toContain("# Scoped Working Context");
    expect(text).toContain("## Current Artifact");
    expect(text).toContain("type: draft");
    expect(text).toContain("这是最新 draft 正文");
    expect(text).toContain("## Recent User Feedback");
    expect(text).toContain("用户补充：别写成教程。");
    expect(text).not.toContain("这是旧 draft 正文");
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run:

```bash
npm test -- src/lib/ai/context-projection.test.ts
```

Expected: FAIL because `src/lib/ai/context-projection.ts` does not exist.

- [ ] **Step 3: Add the projection implementation**

Create `src/lib/ai/context-projection.ts`:

```ts
import type { Skill } from "@/lib/domain";
import type { DirectorInputParts, DirectorMessage } from "./prompts";

export type ContextViewPolicy = {
  artifacts: {
    draft: "latest" | "summary" | "all" | "none";
  };
  tree: "current-node" | "current-path-summary" | "all";
  messages: "recent" | "none";
  skills: "enabled" | "none";
};

export const SUBAGENT_CONTEXT_POLICY = {
  artifacts: { draft: "latest" },
  tree: "current-node",
  messages: "recent",
  skills: "enabled"
} satisfies ContextViewPolicy;

export type CurrentArtifact = {
  type: "draft";
  value: string;
};

export type ProjectedAgentContext = {
  artifactContext: string;
  currentArtifact: CurrentArtifact | null;
  currentNode: string;
  currentRequest: string;
  enabledSkills: Skill[];
  recentUserFeedback: string[];
  selectedDirection: string;
};

export function projectAgentContext(
  source: DirectorInputParts,
  policy: ContextViewPolicy = SUBAGENT_CONTEXT_POLICY
): ProjectedAgentContext {
  const currentDraft = source.currentDraft.trim();

  return {
    artifactContext: source.artifactContext?.trim() ?? "",
    currentArtifact:
      policy.artifacts.draft === "latest" && currentDraft
        ? {
            type: "draft",
            value: currentDraft
          }
        : null,
    currentNode: policy.tree === "current-node" ? source.pathSummary.trim() : source.pathSummary.trim(),
    currentRequest: source.rootSummary.trim(),
    enabledSkills: policy.skills === "enabled" ? source.enabledSkills : [],
    recentUserFeedback: policy.messages === "recent" ? recentUserMessages(source.messages ?? []) : [],
    selectedDirection: source.selectedOptionLabel.trim()
  };
}

export function formatProjectedAgentContext(snapshot: ProjectedAgentContext) {
  return [
    "# Scoped Working Context",
    snapshot.artifactContext ? ["## Artifact Context", snapshot.artifactContext].join("\n") : "",
    snapshot.currentRequest ? ["## Initial Input", snapshot.currentRequest].join("\n") : "",
    snapshot.selectedDirection ? ["## Selected Direction Or Current Request", snapshot.selectedDirection].join("\n") : "",
    snapshot.currentArtifact
      ? ["## Current Artifact", `type: ${snapshot.currentArtifact.type}`, snapshot.currentArtifact.value].join("\n")
      : "## Current Artifact\n暂无。",
    snapshot.enabledSkills.length > 0
      ? ["## Enabled Skills", snapshot.enabledSkills.map(formatSkill).join("\n\n")].join("\n")
      : "## Enabled Skills\n暂无。",
    snapshot.recentUserFeedback.length > 0
      ? ["## Recent User Feedback", snapshot.recentUserFeedback.join("\n\n")].join("\n")
      : "## Recent User Feedback\n暂无。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

function recentUserMessages(messages: DirectorMessage[]) {
  return messages
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .slice(-2)
    .map((message) => String(message.content).trim())
    .filter(Boolean);
}

function formatSkill(skill: Skill) {
  return [
    `Skill: ${skill.title}`,
    `说明：${skill.description || "无补充说明。"}`,
    skill.prompt.trim() ? `要求：${skill.prompt.trim()}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Run projection tests**

Run:

```bash
npm test -- src/lib/ai/context-projection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/ai/context-projection.ts src/lib/ai/context-projection.test.ts
git commit -m "feat: add agent context projection"
```

---

### Task 2: Wire Projected Context Into Subagent Runtime

**Files:**
- Modify: `src/lib/ai/subagent-runtime.ts`
- Modify: `src/lib/ai/subagent-runtime.test.ts`

- [ ] **Step 1: Update subagent runtime tests first**

In `src/lib/ai/subagent-runtime.test.ts`, update the template test call to use runtime context:

```ts
const runtime = createSubagentRuntimeTools({
  env: { KIMI_API_KEY: "test-token" },
  contextSource: {
    artifactContext: "产物类型：社媒草稿。",
    rootSummary: "Seed：周末短途旅行",
    learnedSummary: "",
    currentDraft: "标题：最新版\n正文：最新正文",
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel: "补资料",
    enabledSkills: [],
    messages: [{ role: "user", content: "用户补充：保留真实感。" }]
  },
  runSubagentTask: vi.fn(async (task) => {
    calls.push(task);
    return "search result";
  })
});

const result = await executableTool(runtime.tools.run_subagent_template).execute(
  {
    templateId: "material-search",
    task: "找三条资料"
  },
  { abortSignal: controller.signal }
);

expect(calls[0]).toMatchObject({
  context: expect.stringContaining("最新正文"),
  expectedOutput: "资料清单：每条包含来源、要点、可用角度和可信度提示。",
  task: "找三条资料",
  title: "素材搜索"
});
expect(calls[0].context).toContain("# Scoped Working Context");
expect(calls[0].context).toContain("用户补充：保留真实感。");
```

Update the custom subagent test to omit `context`:

```ts
const runtime = createSubagentRuntimeTools({
  env: { TRITREE_MAX_OUTPUT_TOKENS: "1234" },
  contextSource: {
    artifactContext: "产物类型：社媒草稿。",
    rootSummary: "Seed：AI PM",
    learnedSummary: "",
    currentDraft: "标题：最新\n正文：最新草稿正文",
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel: "修正文",
    enabledSkills: [],
    messages: []
  },
  runSubagentTask: async (task) => {
    calls.push(task);
    return "custom result";
  }
});

const result = await executableTool(runtime.tools.run_custom_subagent).execute(
  {
    title: "事实核查",
    task: "检查这段话是否自洽",
    expectedOutput: "列出问题和建议",
    constraints: "只返回检查结论"
  },
  { abortSignal: controller.signal }
);

expect(result).toEqual({
  ok: true,
  result: "custom result",
  title: "事实核查"
});
expect(calls[0]).toMatchObject({
  constraints: "只返回检查结论",
  context: expect.stringContaining("最新草稿正文"),
  expectedOutput: "列出问题和建议",
  task: "检查这段话是否自洽",
  title: "事实核查"
});
```

Add an assertion to the tool summary test:

```ts
expect(runtime.toolSummaries.join("\n")).toContain("运行时会提供当前上下文视图");
```

- [ ] **Step 2: Run subagent runtime tests and confirm failures**

Run:

```bash
npm test -- src/lib/ai/subagent-runtime.test.ts
```

Expected: FAIL because `contextSource` is not supported and the schemas still require `context`.

- [ ] **Step 3: Update subagent runtime implementation**

In `src/lib/ai/subagent-runtime.ts`, add imports:

```ts
import {
  SUBAGENT_CONTEXT_POLICY,
  formatProjectedAgentContext,
  projectAgentContext,
  type ContextViewPolicy
} from "./context-projection";
import type { DirectorInputParts } from "./prompts";
```

Update options:

```ts
type CreateSubagentRuntimeToolsOptions = {
  contextPolicy?: ContextViewPolicy;
  contextSource?: DirectorInputParts;
  env?: StringEnv;
  runSubagentTask?: SubagentTaskRunner;
  templates?: SubagentTemplate[];
};
```

Update `createSubagentRuntimeTools` parameters:

```ts
export function createSubagentRuntimeTools({
  contextPolicy = SUBAGENT_CONTEXT_POLICY,
  contextSource,
  env = process.env,
  runSubagentTask = runSubagentTaskWithModel,
  templates = DEFAULT_SUBAGENT_TEMPLATES
}: CreateSubagentRuntimeToolsOptions = {}) {
  const subagentContext = subagentContextForRun(contextSource, contextPolicy);
```

Replace template input schema with:

```ts
inputSchema: z.object({
  templateId: z.string().min(1).describe("Template id from the available subagent template list."),
  task: z.string().min(1).describe("Specific bounded task for the subagent."),
  expectedOutput: z.string().min(1).optional().describe("Optional output override for this run.")
}),
execute: async ({ templateId, task, expectedOutput }, executeContext?: ToolExecuteContext) => {
```

When building the template task, use:

```ts
context: subagentContext,
```

Replace custom input schema with:

```ts
inputSchema: z.object({
  title: z.string().min(1).describe("Short role title for the custom subagent."),
  task: z.string().min(1).describe("Specific bounded task for the subagent."),
  expectedOutput: z.string().min(1).describe("Expected output shape or content requirements."),
  constraints: z.string().min(1).optional().describe("Optional constraints for this run.")
}),
execute: async ({ title, task, expectedOutput, constraints }, executeContext?: ToolExecuteContext) => {
```

When building the custom task, use:

```ts
context: subagentContext,
```

Update tool summaries:

```ts
toolSummaries: [
  "run_subagent_template：运行预创建子代理模板；当模板列表中某个 templateId 与任务匹配时使用。调用时提供 templateId、task 和可选 expectedOutput，运行时会提供当前上下文视图。",
  "run_custom_subagent：运行自定义子代理，仅当预创建模板不匹配且任务边界清晰时使用；调用时提供 title、task、expectedOutput 和可选 constraints，运行时会提供当前上下文视图。"
],
```

Add helper:

```ts
function subagentContextForRun(contextSource: DirectorInputParts | undefined, policy: ContextViewPolicy) {
  if (!contextSource) return "# Scoped Working Context\n暂无可用上下文。";
  return formatProjectedAgentContext(projectAgentContext(contextSource, policy));
}
```

Update `buildSubagentInstructions`:

```ts
function buildSubagentInstructions(task: SubagentTask) {
  return `
You are an isolated execution unit called by the main agent.
You receive a scoped, read-only snapshot of the current working context.
Complete only the assigned task.
Return a result that the main agent can inspect, verify, and decide how to use.
All user-facing text should be Simplified Chinese unless the input requires otherwise.

# Role
${task.title}

${task.template ? `# Template Prompt\n${task.template.prompt}` : "# Custom Role\nFollow the role title, assigned task, and constraints precisely."}
`.trim();
}
```

- [ ] **Step 4: Run subagent runtime tests**

Run:

```bash
npm test -- src/lib/ai/subagent-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/ai/subagent-runtime.ts src/lib/ai/subagent-runtime.test.ts
git commit -m "feat: project context for subagent tools"
```

---

### Task 3: Pass Director Context Into Runtime Tools

**Files:**
- Modify: `src/lib/ai/mastra-executor.ts`
- Modify: `src/lib/ai/mastra-executor.test.ts`
- Modify: `src/lib/ai/mastra-context.ts`
- Modify: `src/lib/ai/mastra-context.test.ts`

- [ ] **Step 1: Add executor and prompt tests**

In `src/lib/ai/mastra-executor.test.ts`, add this test near the existing runtime tool tests:

```ts
it("passes director parts to subagent runtime tools as projection source", async () => {
  const finalObject = {
    roundIntent: "选择下一步",
    options: [
      { id: "a", label: "A", description: "A desc", impact: "A impact", kind: "explore" },
      { id: "b", label: "B", description: "B desc", impact: "B impact", kind: "deepen" },
      { id: "c", label: "C", description: "C desc", impact: "C impact", kind: "reframe" }
    ]
  };
  const stream = vi.fn(async () => ({
    fullStream: async function* () {
      yield {
        type: "tool-call",
        payload: {
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

  await streamTreeOptions({
    parts: directorParts,
    env: { KIMI_API_KEY: "token" }
  });

  expect(mocks.createSubagentRuntimeTools).toHaveBeenCalledWith(
    expect.objectContaining({
      contextSource: directorParts,
      env: { KIMI_API_KEY: "token" }
    })
  );
});
```

In `src/lib/ai/mastra-context.test.ts`, update the generic ReAct shell assertions:

```ts
expect(instructions).toContain("调用 subagent 时给出短任务、期望输出和必要约束");
expect(instructions).toContain("运行时会为 subagent 提供当前上下文视图");
expect(instructions).toContain("必须检查工具返回值");
```

Update `shellInput.toolSummaries` strings to the new summaries with runtime context wording:

```ts
"run_subagent_template：运行预创建子代理模板；运行时会提供当前上下文视图。",
"run_custom_subagent：运行自定义子代理；运行时会提供当前上下文视图。",
```

- [ ] **Step 2: Run targeted tests and confirm failures**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts src/lib/ai/mastra-context.test.ts
```

Expected: FAIL because executor has not passed `contextSource`, and the prompt still mentions supplying context.

- [ ] **Step 3: Pass `parts` to subagent runtime**

In `src/lib/ai/mastra-executor.ts`, change:

```ts
const subagentRuntime = createSubagentRuntimeTools({ env });
```

to:

```ts
const subagentRuntime = createSubagentRuntimeTools({ contextSource: parts, env });
```

- [ ] **Step 4: Update generic ReAct protocol text**

In `src/lib/ai/mastra-context.ts`, replace the subagent argument line in `actualWorkExecutionProtocol()` with:

```ts
"调用 subagent 时给出短任务、期望输出和必要约束；运行时会为 subagent 提供当前上下文视图。",
```

Keep these existing responsibility lines intact:

```ts
"subagent 作为工具使用，其返回值不是最终判断。调用任何工具或 subagent 后，必须检查工具返回值是否具体、相关、可信、足以支持本轮目标。",
"完成工具结果检查后，由主 agent 把可用信息整合成目标要求的最终结构化结果；不要把“已调用工具或 subagent”当作本轮完成。",
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts src/lib/ai/mastra-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/lib/ai/mastra-executor.ts src/lib/ai/mastra-executor.test.ts src/lib/ai/mastra-context.ts src/lib/ai/mastra-context.test.ts
git commit -m "feat: pass director context to subagent tools"
```

---

### Task 4: Preserve Stream Display With Compact Subagent Inputs

**Files:**
- Modify: `src/lib/ai/mastra-executor.test.ts`

- [ ] **Step 1: Update stream progress tests for compact inputs**

In the existing test `streams subagent tool activity with template title, task, and completion status`, remove `context` from the `run_subagent_template` tool-call args:

```ts
args: {
  templateId: "material-search",
  task: "找三条低幼家庭可用素材"
}
```

In the custom streaming test, keep the streamed args compact:

```ts
argsTextDelta: '{"title":"社'
```

and:

```ts
argsTextDelta: '媒写手","task":"把这个方案写成一篇完整草稿","expectedOutput":"返回一版草稿"}'
```

Keep assertions:

```ts
expect(visibleProgress).toContain("[子代理] 准备运行 自定义子代理");
expect(visibleProgress).not.toContain("run_custom_subagent");
expect(visibleProgress).not.toContain("社媒写手");
expect(visibleProgress).not.toContain("把这个方案写成一篇完整草稿");
```

- [ ] **Step 2: Run the subagent stream tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts -t "subagent"
```

Expected: PASS.

- [ ] **Step 3: Commit Task 4**

```bash
git add src/lib/ai/mastra-executor.test.ts
git commit -m "test: cover compact subagent stream inputs"
```

---

### Task 5: Final Verification

**Files:**
- Verify repository-wide behavior.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Manual browser check**

With the dev server running at `http://localhost:3000/?new=1`, trigger a generation that calls a subagent. Expected behavior:

- Thinking text uses friendly labels such as `[子代理] 准备运行 自定义子代理`.
- Full subagent call labels show title/task after full args are available.
- Current draft still streams into the right panel.
- The final result appears only after the main agent submits the final tool output.

- [ ] **Step 5: Inspect final git status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on the current feature branch after the implementation commits.

---

## Self-Review Checklist

- Spec coverage:
  - Compact custom subagent input is covered in Task 2.
  - Shared runtime context projection is covered in Tasks 1 and 2.
  - Latest draft as sole draft body is covered in Task 1.
  - Main agent result checking remains covered in Task 3.
  - Stream display stability is covered in Task 4.

- Type consistency:
  - `ContextViewPolicy`, `SUBAGENT_CONTEXT_POLICY`, `projectAgentContext`, and `formatProjectedAgentContext` are introduced in Task 1 and imported by Task 2.
  - `contextSource` uses `DirectorInputParts`, matching the existing executor boundary.
  - `SubagentTask.context` remains a formatted string passed to the model, while tool callers provide compact task arguments.

- Verification:
  - Targeted tests run after each implementation task.
  - Full `npm test`, `npm run typecheck`, and `git diff --check` run before completion.
