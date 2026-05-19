import { DirectorArtifactOutputSchema, DirectorNextStepOutputSchema, DirectorOptionsOutputSchema } from "@/lib/domain";
import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { ZodError, z } from "zod";
import type { SharedAgentContextInput } from "../mastra-context";
import type { RuntimeSubmitTarget } from "./types";
import { ShowProcessDataInputSchema } from "./schemas";

export const SUBMIT_TREE_ARTIFACT_TOOL_NAME = "submit_tree_artifact";
export const SUBMIT_TREE_NEXT_STEP_TOOL_NAME = "submit_tree_next_step";
export const SUBMIT_TREE_OPTIONS_TOOL_NAME = "submit_tree_options";
export const SHOW_PROCESS_DATA_TOOL_NAME = "show_process_data";
export const RUN_SUBAGENT_TEMPLATE_TOOL_NAME = "run_subagent_template";
export const RUN_CUSTOM_SUBAGENT_TOOL_NAME = "run_custom_subagent";

export function withFinalSubmitToolSummary(
  context: SharedAgentContextInput,
  target: RuntimeSubmitTarget
): SharedAgentContextInput {
  if (target === "turn") {
    return {
      ...context,
      toolSummaries: [
        ...(context.toolSummaries ?? []),
        `${SUBMIT_TREE_ARTIFACT_TOOL_NAME}：最终提交工具，用于提交 artifact 卡片或 artifact=null 的收束结果。完成必要的工具调用和结果检查后，如果本轮已经可以形成、更新或收束作品，必须调用此工具；调用后必须立即停止，不要继续输出 thinking、解释、总结、Markdown、JSON 文本或普通自然语言，也不要再调用其他工具。${artifactOutputShapeSummary()}`,
        `${SUBMIT_TREE_OPTIONS_TOOL_NAME}：最终提交工具，用于提交需要用户选择的 3 选 1。完成必要的工具调用和结果检查后，如果本轮需要用户决定方向，必须调用此工具；调用后必须立即停止，不要继续输出 thinking、解释、总结、Markdown、JSON 文本或普通自然语言，也不要再调用其他工具。${optionsOutputShapeSummary()}`
      ]
    };
  }

  const toolName = finalSubmitToolName(target);
  const finalShape =
    target === "artifact"
      ? artifactOutputShapeSummary()
      : target === "next-step"
        ? nextStepOutputShapeSummary()
        : optionsOutputShapeSummary();
  return {
    ...context,
    toolSummaries: [
      ...(context.toolSummaries ?? []),
      `${toolName}：最终提交工具，也是本轮任务唯一完成方式。完成必要的工具调用和结果检查后，必须调用此工具提交本轮结构化结果；调用 ${toolName} 后必须立即停止，不要继续输出 thinking、解释、总结、Markdown、JSON 文本或普通自然语言，也不要再调用其他工具。${finalSubmitRoutingGuidance(target)}${finalShape}`
    ]
  };
}

export function withProcessDataDisplayToolSummary(context: SharedAgentContextInput): SharedAgentContextInput {
  return {
    ...context,
    toolSummaries: [
      ...(context.toolSummaries ?? []),
      `${SHOW_PROCESS_DATA_TOOL_NAME}：向用户展示本轮工具调用后值得看见的过程数据。调用其他工具并检查返回值后，如果资料、搜索结果、参考清单或证据摘要会影响用户选择或理解，可在最终提交前调用；只展示本轮新调用工具后整理出的材料，不要重放历史 show_process_data，不要把最终 options 重复或改写成过程材料；如果本轮提交 options，过程材料必须支撑同一个 roundIntent 和三个 options，不能成为另一组 A/B/C 选项、候选题或选择清单；只提交通用展示结构 { title, sourceToolCallIds, items, note }，不要把原始工具输出或业务专用字段直接塞给 UI。`
    ]
  };
}

export function withProcessDataDisplayTool(tools: ToolsInput): ToolsInput {
  return {
    ...tools,
    [SHOW_PROCESS_DATA_TOOL_NAME]: createTool({
      id: SHOW_PROCESS_DATA_TOOL_NAME,
      description:
        "Display user-facing process data from newly called and inspected tool results during this ReAct turn. Use before the final submit tool when the user should see source material or evidence. Do not replay historical show_process_data, duplicate final options, or create another A/B/C choice list. The UI renders exactly this generic display shape.",
      inputSchema: ShowProcessDataInputSchema,
      outputSchema: z.literal(true),
      execute: async () => true as const
    })
  };
}

export function withFinalSubmitTool(tools: ToolsInput, target: RuntimeSubmitTarget): ToolsInput {
  if (target === "turn") {
    return {
      ...tools,
      [SUBMIT_TREE_ARTIFACT_TOOL_NAME]: createTool({
        id: SUBMIT_TREE_ARTIFACT_TOOL_NAME,
        description:
          "Submit the final artifact card or a null-artifact completion result for this main ReAct turn. After calling it, stop immediately and do not emit more text, thinking, Markdown, JSON, or tool calls.",
        inputSchema: DirectorArtifactOutputSchema,
        execute: async (input) => input
      }),
      [SUBMIT_TREE_OPTIONS_TOOL_NAME]: createTool({
        id: SUBMIT_TREE_OPTIONS_TOOL_NAME,
        description:
          "Submit the final three-choice options for this main ReAct turn. Use when the user should choose how to proceed. After calling it, stop immediately and do not emit more text, thinking, Markdown, JSON, or tool calls.",
        inputSchema: DirectorOptionsOutputSchema,
        execute: async (input) => input
      })
    };
  }

  const toolName = finalSubmitToolName(target);
  return {
    ...tools,
    [toolName]: createTool({
      id: toolName,
      description:
        target === "artifact"
          ? "Submit the final artifact output. This is the last step after runtime tools finish. After calling it, stop immediately and do not emit more text, thinking, Markdown, JSON, or tool calls."
          : target === "next-step"
            ? "Submit the final next-step routing decision. Use options after research, reference gathering, analysis, review, or comparison when the user should choose how to proceed; use artifact when the next work result is already clear; use complete only when the current request can be closed without another user choice or work result. After calling it, stop immediately and do not emit more text, thinking, Markdown, JSON, or tool calls."
            : "Submit the final branch options output. This is the last step after runtime tools finish. After calling it, stop immediately and do not emit more text, thinking, Markdown, JSON, or tool calls.",
      inputSchema:
        target === "artifact"
          ? DirectorArtifactOutputSchema
          : target === "next-step"
            ? DirectorNextStepOutputSchema
            : DirectorOptionsOutputSchema,
      execute: async (input) => input
    })
  };
}

function finalSubmitRoutingGuidance(target: RuntimeSubmitTarget) {
  if (target !== "next-step") return "";

  return [
    "\nnext-step action 选择：",
    "action=options 用于需要用户继续选择的本轮结果，尤其是资料、搜索、参考、素材收集、分析、审稿或比较之后。",
    "action=artifact 用于下一步已经明确、可以直接生成或更新作品。",
    "action=complete 用于当前请求已经可以收束，适合用户明确要求结束、发布、交付、停止继续澄清，或当前目标已经没有可行动下一步。"
  ].join("\n");
}

export function finalSubmitToolName(target: RuntimeSubmitTarget) {
  if (target === "turn") return `${SUBMIT_TREE_ARTIFACT_TOOL_NAME} 或 ${SUBMIT_TREE_OPTIONS_TOOL_NAME}`;
  return target === "artifact"
    ? SUBMIT_TREE_ARTIFACT_TOOL_NAME
    : target === "next-step"
      ? SUBMIT_TREE_NEXT_STEP_TOOL_NAME
      : SUBMIT_TREE_OPTIONS_TOOL_NAME;
}

export function finalSubmitToolRequiredError(target: RuntimeSubmitTarget) {
  return new ZodError([
    {
      code: "custom",
      path: [],
      message: `必须调用 ${finalSubmitToolName(target)} 工具提交最终结果，不能把最终 JSON、Markdown 或正文写成普通文本。`
    }
  ]);
}

export function artifactOutputShapeSummary() {
  return [
    "必须返回对象：{ roundIntent, artifact }。",
    "artifact 可以是 null；如果产生产物，必须包含 { type, payload }，payload 结构由对应产物插件决定。"
  ].join("\n");
}

export function optionsOutputShapeSummary() {
  return [
    "必须返回对象：{ roundIntent, options }。",
    "options 必须正好 3 项，id 必须分别是 a、b、c 且只出现一次。",
    "每个 option 必须包含 { id, label, description, impact, kind }；kind 只能是 explore、deepen、reframe 或 finish。"
  ].join("\n");
}

export function nextStepOutputShapeSummary() {
  return [
    "必须返回对象：{ action, roundIntent }。",
    "action 只能是 artifact、options 或 complete。",
    "资料、搜索、参考、素材收集、分析、审稿或比较之后，通常用 action=options 让用户决定如何继续，或用 action=artifact 直接生成已明确的作品更新。",
    "action=complete 表示当前请求已经可以收束，适合用户明确要求结束、发布、交付、停止继续澄清，或当前目标已经没有可行动下一步。",
    "当 action=artifact 时只返回 action 和 roundIntent，后续 artifact 阶段负责生成作品内容。",
    "当 action=complete 时不要返回 options；如果包含 artifact，只能是 null。",
    "当 action=options 时必须返回 options 正好 3 项；每项只需要包含 { label, description, impact }，系统会自动补 id 和 kind。"
  ].join("\n");
}

export function turnOutputShapeSummary() {
  return [
    "必须调用一个最终提交工具：submit_tree_artifact 或 submit_tree_options。",
    "submit_tree_artifact 参数必须是 { roundIntent, artifact }；artifact 可以是 null；如果产生产物，artifact 必须包含 { type, payload }。",
    "submit_tree_options 参数必须是 { roundIntent, options }；options 必须正好 3 项，id 必须分别是 a、b、c 且只出现一次。"
  ].join("\n");
}

export function isFinalSubmitToolName(toolName: string) {
  return (
    toolName === SUBMIT_TREE_ARTIFACT_TOOL_NAME ||
    toolName === SUBMIT_TREE_NEXT_STEP_TOOL_NAME ||
    toolName === SUBMIT_TREE_OPTIONS_TOOL_NAME
  );
}

export function isProcessDataDisplayToolName(toolName: string) {
  return toolName === SHOW_PROCESS_DATA_TOOL_NAME;
}

export function isSubagentToolName(toolName: string) {
  return toolName === RUN_SUBAGENT_TEMPLATE_TOOL_NAME || toolName === RUN_CUSTOM_SUBAGENT_TOOL_NAME;
}
