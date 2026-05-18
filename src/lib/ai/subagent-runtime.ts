import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { TokenLimiterProcessor } from "@mastra/core/processors";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  SUBAGENT_CONTEXT_POLICY,
  formatProjectedAgentContext,
  projectAgentContext,
  type ContextViewPolicy
} from "./context-projection";
import { createTreeableAnthropicModel } from "./mastra-agents";
import { DEFAULT_MAX_OUTPUT_TOKENS, resolveModelContextBudget } from "./model-context";
import type { DirectorInputParts } from "./prompts";
import {
  DEFAULT_SUBAGENT_TEMPLATES,
  formatSubagentTemplateSummaries,
  getSubagentTemplate,
  type SubagentTemplate
} from "./subagent-templates";

type StringEnv = Record<string, string | undefined>;

export type SubagentTask = {
  abortSignal?: AbortSignal;
  constraints?: string;
  context: string;
  env?: StringEnv;
  expectedOutput: string;
  task: string;
  template?: SubagentTemplate;
  title: string;
};

export type SubagentTaskRunner = (task: SubagentTask) => Promise<string>;

type ToolExecuteContext = {
  abortSignal?: AbortSignal;
};

type CreateSubagentRuntimeToolsOptions = {
  contextPolicy?: ContextViewPolicy;
  contextSource?: DirectorInputParts;
  env?: StringEnv;
  runSubagentTask?: SubagentTaskRunner;
  templates?: SubagentTemplate[];
};

export function createSubagentRuntimeTools({
  contextPolicy = SUBAGENT_CONTEXT_POLICY,
  contextSource,
  env = process.env,
  runSubagentTask = runSubagentTaskWithModel,
  templates = DEFAULT_SUBAGENT_TEMPLATES
}: CreateSubagentRuntimeToolsOptions = {}) {
  const subagentContext = subagentContextForRun(contextSource, contextPolicy);
  const tools: ToolsInput = {
    run_subagent_template: createTool({
      id: "run_subagent_template",
      description:
        "Run one precreated Tritree subagent template for a bounded task using supplied context. Use this when a listed template matches the need.",
      inputSchema: z.object({
        templateId: z.string().min(1).describe("Template id from the available subagent template list."),
        task: z.string().min(1).describe("Specific bounded task for the subagent."),
        expectedOutput: z.string().min(1).optional().describe("Optional output override for this run.")
      }),
      execute: async ({ templateId, task, expectedOutput }, executeContext?: ToolExecuteContext) => {
        const template = getSubagentTemplate(templateId, templates);
        if (!template) {
          throw new Error(`Unknown subagent template: ${templateId}`);
        }

        const result = await runSubagentTask({
          abortSignal: executeContext?.abortSignal,
          context: subagentContext,
          env,
          expectedOutput: expectedOutput ?? template.expectedOutput,
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
    }),
    run_custom_subagent: createTool({
      id: "run_custom_subagent",
      description:
        "Run a custom one-off Tritree subagent only when no precreated template matches a bounded task.",
      inputSchema: z.object({
        title: z.string().min(1).describe("Short role title for the custom subagent."),
        task: z.string().min(1).describe("Specific bounded task for the subagent."),
        expectedOutput: z.string().min(1).describe("Expected output shape or content requirements."),
        constraints: z.string().min(1).optional().describe("Optional constraints for this run.")
      }),
      execute: async ({ title, task, expectedOutput, constraints }, executeContext?: ToolExecuteContext) => {
        const result = await runSubagentTask({
          abortSignal: executeContext?.abortSignal,
          constraints,
          context: subagentContext,
          env,
          expectedOutput,
          task,
          template: undefined,
          title
        });

        return {
          ok: true,
          result,
          title
        };
      }
    })
  };

  return {
    subagentTemplateSummaries: [formatSubagentTemplateSummaries(templates)],
    toolSummaries: [
      "run_subagent_template：运行预创建子代理模板；当模板列表中某个 templateId 与任务匹配时使用。调用时提供 templateId、task 和可选 expectedOutput，运行时会提供当前上下文视图。",
      "run_custom_subagent：运行自定义子代理，仅当预创建模板不匹配且任务边界清晰时使用；调用时提供 title、task、expectedOutput 和可选 constraints，运行时会提供当前上下文视图。"
    ],
    tools
  };
}

function subagentContextForRun(contextSource: DirectorInputParts | undefined, policy: ContextViewPolicy) {
  if (!contextSource) return "# Scoped Working Context\n暂无可用上下文。";
  return formatProjectedAgentContext(projectAgentContext(contextSource, policy));
}

export async function runSubagentTaskWithModel(task: SubagentTask): Promise<string> {
  const env = task.env ?? process.env;
  const agent = new Agent({
    id: "tritree-subagent-runtime-agent",
    name: `Tritree ${task.title} Subagent`,
    instructions: buildSubagentInstructions(task),
    model: createTreeableAnthropicModel(env),
    defaultOptions: { modelSettings: { maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS } },
    inputProcessors: [new TokenLimiterProcessor({ limit: resolveModelContextBudget(env).inputBudgetTokens })]
  });

  const result = await agent.generate([
    {
      role: "user",
      content: buildSubagentUserPrompt(task)
    }
  ], { abortSignal: task.abortSignal });

  return resultToText(result);
}

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

function buildSubagentUserPrompt(task: SubagentTask) {
  return `
# Task
${task.task}

# Context
${task.context}

${task.constraints ? `# Constraints\n${task.constraints}\n` : ""}# Expected Output
${task.expectedOutput}
`.trim();
}

function resultToText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!isRecord(result)) return String(result ?? "");

  for (const key of ["text", "output", "content"]) {
    const value = result[key];
    const text = valueToText(value);
    if (text) return text;
  }

  return JSON.stringify(result);
}

function valueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join("");
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (typeof value.value === "string") return value.value;
    return JSON.stringify(value);
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
