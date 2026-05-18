import {
  type AgentMessage,
  type BranchOption,
  type DirectorArtifactOutput,
  DirectorArtifactOutputSchema,
  DirectorNextStepOutputSchema,
  DirectorOptionsOutputSchema,
  DirectorTurnOutputSchema,
  type GeneratedArtifact,
  type DirectorNextStepOutput,
  type DirectorOptionsOutput,
  type DirectorTurnOutput,
  type Skill
} from "@/lib/domain";
import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z, ZodError, type ZodIssue } from "zod";
import { createSkillRuntimeTools } from "@/lib/skills/skill-runtime";
import {
  createTreeArtifactAgent,
  createTreeNextStepAgent,
  createTreeOptionsAgent,
  createTreeTurnAgent,
  createTreeableAnthropicModel
} from "./mastra-agents";
import { compactDirectorMessagesForModel } from "./model-context";
import {
  buildTreeArtifactInstructions,
  buildTreeNextStepInstructions,
  buildTreeOptionsInstructions,
  buildTreeTurnInstructions,
  type SharedAgentContextInput
} from "./mastra-context";
import { logTritreeAiDebug, logTritreeAiResponse, logTritreeAiStream } from "./debug-log";
import { buildDirectorInput } from "./director";
import { createMcpRuntimeTools, type McpRuntimeTools } from "./mcp-runtime";
import type { DirectorInputParts } from "./prompts";
import { createSubagentRuntimeTools } from "./subagent-runtime";
import { getSubagentTemplate } from "./subagent-templates";

export type MastraConversationMessage = {
  role: "assistant" | "tool" | "user";
  content: AgentMessage["content"];
};

type TreeArtifactAgentLike = {
  generate: (
    messages: MastraConversationMessage[],
    options: {
      abortSignal?: AbortSignal;
      maxSteps?: number;
      structuredOutput: { jsonPromptInjection?: boolean; model?: unknown; schema: unknown };
      toolCallConcurrency?: number;
      toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
    }
  ) => Promise<{ object?: unknown; output?: unknown }>;
  stream?: (
    messages: MastraConversationMessage[],
    options: {
      abortSignal?: AbortSignal;
      maxSteps?: number;
      structuredOutput?: { jsonPromptInjection?: boolean; model?: unknown; schema: unknown };
      toolCallConcurrency?: number;
      toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
    }
  ) => Promise<StructuredObjectStreamResult>;
};

type TreeOptionsAgentLike = {
  generate: (
    messages: MastraConversationMessage[],
    options: {
      abortSignal?: AbortSignal;
      maxSteps?: number;
      structuredOutput: { jsonPromptInjection?: boolean; model?: unknown; schema: unknown };
      toolCallConcurrency?: number;
      toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
    }
  ) => Promise<{ object?: unknown; output?: unknown }>;
  stream?: (
    messages: MastraConversationMessage[],
    options: {
      abortSignal?: AbortSignal;
      maxSteps?: number;
      structuredOutput?: { jsonPromptInjection?: boolean; model?: unknown; schema: unknown };
      toolCallConcurrency?: number;
      toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string };
    }
  ) => Promise<StructuredObjectStreamResult>;
};

type StructuredObjectStreamResult = {
  objectStream?: StreamSource<unknown>;
  fullStream?: StreamSource<unknown>;
  object?: Promise<unknown> | unknown;
  output?: Promise<unknown> | unknown;
};

type StreamSource<T> = AsyncIterable<T> | ReadableStream<T> | (() => AsyncIterable<T>);

type AgentExecutionContextOverride = Pick<
  SharedAgentContextInput,
  "availableSkillSummaries" | "longTermMemory" | "subagentTemplateSummaries" | "toolSummaries"
>;

export type TreeDirectorExecutionInput = {
  parts: DirectorInputParts;
  signal?: AbortSignal;
  env?: Record<string, string | undefined>;
  context?: Partial<AgentExecutionContextOverride>;
};

type TreeArtifactPartial = Partial<Omit<DirectorArtifactOutput, "artifact">> & {
  artifact?: Partial<GeneratedArtifact> | null;
};

type TreeOptionsPartial = Partial<Omit<DirectorOptionsOutput, "options">> & {
  options?: Array<Partial<BranchOption>>;
};

type TreeNextStepPartial = {
  action?: "artifact" | "complete" | "options";
  artifact?: Partial<GeneratedArtifact> | null;
  options?: Array<Partial<BranchOption>>;
  roundIntent?: string;
};

type TreeTurnPartial = TreeNextStepPartial;

type ReasoningTextEvent = {
  delta: string;
  accumulatedText: string;
};

export type ProcessDataDisplay = z.infer<typeof ShowProcessDataInputSchema>;

type ParseableOutputSchema<TOutput> = {
  parse(value: unknown): TOutput;
};

type RuntimeToolStreamSummary = {
  abortSignalAborted: boolean;
  abortSignalReason: string;
  agentMessages: AgentMessage[];
  latestPartial: unknown;
  rawText: string;
  streamChunkCount: number;
  streamChunks: RuntimeStreamChunkSummary[];
  streamDurationMs: number;
  streamShape: RuntimeStreamShape;
  submittedOutput: unknown;
};

type RuntimeStreamShape = {
  hasFullStream: boolean;
  hasObject: boolean;
  hasObjectStream: boolean;
  hasOutput: boolean;
};

type RuntimeStreamChunkSummary = {
  index: number;
  keys: string[];
  payloadKeys?: string[];
  reasoningChars: number;
  source: "fullStream" | "objectStream";
  submittedOutput: boolean;
  textChars: number;
  toolName?: string;
  type: string;
};

export type DirectorAgentTrace = {
  agentMessages?: AgentMessage[];
};

type ToolCallDeltaState = {
  announcedIds: Set<string>;
  argsById: Map<string, string>;
  processDataOutputById: Map<string, string>;
  submittedOutputById: Map<string, string>;
  toolNamesById: Map<string, string>;
};

type AgentMessageHistoryState = {
  messages: AgentMessage[];
  toolCallIndexesById: Map<string, number>;
  toolResultIds: Set<string>;
};

type ProgressSegmentKind = "debug" | "text" | "tool";
type RuntimeSubmitTarget = "artifact" | "next-step" | "options" | "turn";

type ProgressSegment = {
  delta: string;
  kind: ProgressSegmentKind;
};

const MAX_STRUCTURED_OUTPUT_RETRIES = 2;
const MASTRA_STRUCTURED_OUTPUT_VALIDATION_ID = "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED";
const SUBMIT_TREE_ARTIFACT_TOOL_NAME = "submit_tree_artifact";
const SUBMIT_TREE_NEXT_STEP_TOOL_NAME = "submit_tree_next_step";
const SUBMIT_TREE_OPTIONS_TOOL_NAME = "submit_tree_options";
const SHOW_PROCESS_DATA_TOOL_NAME = "show_process_data";
const RUN_SUBAGENT_TEMPLATE_TOOL_NAME = "run_subagent_template";
const RUN_CUSTOM_SUBAGENT_TOOL_NAME = "run_custom_subagent";
const ACTUAL_WORK_RETRY_MESSAGE =
  "You must complete a meaningful ReAct step before ending this turn. Handle the task yourself when possible, inspect any tool or subagent result you use, call the required final submit tool, or submit three user-facing options only when a real user decision is blocked.";

const ProcessDataDisplayItemSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(400).optional(),
    meta: z.string().trim().max(160).optional(),
    url: z.string().trim().max(1000).optional()
  })
  .strict();

const ShowProcessDataInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    sourceToolCallIds: z.array(z.string().trim().min(1)).max(20).default([]),
    items: z.array(ProcessDataDisplayItemSchema).min(1).max(30),
    note: z.string().trim().max(500).optional()
  })
  .strict();

type TreeNextStepAgentLike = TreeOptionsAgentLike;
type TreeTurnAgentLike = TreeOptionsAgentLike;

type DirectorRuntimeToolPolicy = {
  includeSubagentTools?: boolean;
};

export async function generateTreeArtifact({
  parts,
  signal,
  env,
  context,
  treeArtifactAgent,
  suppressResponseLog
}: TreeDirectorExecutionInput & {
  treeArtifactAgent?: TreeArtifactAgentLike;
  suppressResponseLog?: boolean;
}): Promise<DirectorArtifactOutput> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeArtifactAgent));
  const { agentContext, tools } = executionContext;
  try {
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("artifact", agentContext, messages);
    const agent = treeArtifactAgent ?? (createTreeArtifactAgent(agentContext, env, tools) as unknown as TreeArtifactAgentLike);
    const output = await withStructuredOutputRetries(messages, "artifact", async (attemptMessages) => {
      let result: Awaited<ReturnType<TreeArtifactAgentLike["generate"]>>;
      try {
        result = await agent.generate(attemptMessages, {
          abortSignal: signal,
          ...executionOptionsForTools(tools),
          structuredOutput: structuredOutputForDirector(DirectorArtifactOutputSchema, env, tools, "generate")
        });
      } catch (error) {
        return DirectorArtifactOutputSchema.parse(recoverMastraStructuredOutputValidationValue(error));
      }

      return DirectorArtifactOutputSchema.parse(unwrapMastraToolInput(result.object ?? result.output));
    });
    if (!suppressResponseLog) logAiResponse("artifact", "generate", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

export async function generateTreeNextStep({
  parts,
  signal,
  env,
  context,
  treeNextStepAgent,
  suppressResponseLog
}: TreeDirectorExecutionInput & {
  treeNextStepAgent?: TreeNextStepAgentLike;
  suppressResponseLog?: boolean;
}): Promise<DirectorNextStepOutput> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeNextStepAgent), {
    includeSubagentTools: false
  });
  const { agentContext, tools } = executionContext;
  try {
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("next-step", agentContext, messages);
    const agent = treeNextStepAgent ?? (createTreeNextStepAgent(agentContext, env, tools) as unknown as TreeNextStepAgentLike);
    const output = await withStructuredOutputRetries(messages, "next-step", async (attemptMessages) => {
      let result: Awaited<ReturnType<TreeNextStepAgentLike["generate"]>>;
      try {
        result = await agent.generate(attemptMessages, {
          abortSignal: signal,
          ...executionOptionsForTools(tools),
          structuredOutput: structuredOutputForDirector(DirectorNextStepOutputSchema, env, tools, "generate")
        });
      } catch (error) {
        return DirectorNextStepOutputSchema.parse(recoverMastraStructuredOutputValidationValue(error));
      }

      return DirectorNextStepOutputSchema.parse(unwrapMastraToolInput(result.object ?? result.output));
    });
    if (!suppressResponseLog) logAiResponse("next-step", "generate", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

export async function streamTreeNextStep({
  parts,
  signal,
  env,
  context,
  treeNextStepAgent,
  onPartialObject,
  onProcessData,
  onReasoningText
}: TreeDirectorExecutionInput & {
  treeNextStepAgent?: TreeNextStepAgentLike;
  onPartialObject?: (partial: TreeNextStepPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
}): Promise<DirectorNextStepOutput & DirectorAgentTrace> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeNextStepAgent), {
    includeSubagentTools: false
  });
  const { agentContext, tools } = executionContext;
  try {
    const runtimeHasTools = hasRuntimeTools(tools);
    let agentContextWithSubmit = agentContext;
    let agentTools = tools;
    if (runtimeHasTools) {
      agentContextWithSubmit = withFinalSubmitToolSummary(withProcessDataDisplayToolSummary(agentContext), "next-step");
      agentTools = withFinalSubmitTool(withProcessDataDisplayTool(tools), "next-step");
    }
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("next-step", agentContextWithSubmit, messages);
    const agent = treeNextStepAgent ?? (createTreeNextStepAgent(agentContextWithSubmit, env, agentTools) as unknown as TreeNextStepAgentLike);
    if (runtimeHasTools) {
      const runtimeTools = agentTools as ToolsInput;
      const output = await streamRuntimeToolsThenStructure<TreeNextStepPartial, DirectorNextStepOutput>({
        agent,
        env,
        messages,
        onPartialObject,
        onProcessData,
        onReasoningText,
        schema: DirectorNextStepOutputSchema,
        signal,
        target: "next-step",
        tools: runtimeTools
      });
      logAiResponse("next-step", "stream", output);
      return output;
    }

    let bestPartial: unknown = null;
    const output = await withStructuredOutputRetries(messages, "next-step", async (attemptMessages) => {
      const stream = agent.stream
        ? await agent.stream(attemptMessages, {
            abortSignal: signal,
            ...executionOptionsForTools(tools),
            structuredOutput: structuredOutputForDirector(DirectorNextStepOutputSchema, env, tools, "stream")
          })
        : null;

      if (!stream) {
        const output = await generateTreeNextStep({
          parts: { ...parts, messages: attemptMessages },
          signal,
          env,
          context,
          treeNextStepAgent: agent,
          suppressResponseLog: true
        });
        onPartialObject?.(output as TreeNextStepPartial);
        return output;
      }

      let latestPartial: unknown = null;
      if (stream.fullStream) {
        latestPartial = await consumeStructuredFullStream<TreeNextStepPartial>(stream.fullStream, {
          logTarget: "next-step",
          onPartialObject,
          onReasoningText
        });
      } else if (stream.objectStream) {
        for await (const partial of toAsyncIterable(stream.objectStream)) {
          logAiStream("next-step", "partial", partial);
          latestPartial = partial;
          onPartialObject?.(partial as TreeNextStepPartial);
        }
      }

      if (latestPartial !== null) bestPartial = latestPartial;
      const output = await resolveStructuredStreamOutput(stream, latestPartial ?? bestPartial);
      try {
        return DirectorNextStepOutputSchema.parse(output);
      } catch (parseError) {
        logAiResponse("next-step", "stream-parse-failed", output);
        throw parseError;
      }
    });
    logAiResponse("next-step", "stream", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

export async function streamTreeTurn({
  parts,
  signal,
  env,
  context,
  treeTurnAgent,
  onPartialObject,
  onProcessData,
  onReasoningText
}: TreeDirectorExecutionInput & {
  treeTurnAgent?: TreeTurnAgentLike;
  onPartialObject?: (partial: TreeTurnPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
}): Promise<DirectorTurnOutput & DirectorAgentTrace> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeTurnAgent));
  const { agentContext, tools } = executionContext;
  try {
    const runtimeHasTools = hasRuntimeTools(tools);
    let agentContextWithSubmit = agentContext;
    let agentTools = tools;
    if (runtimeHasTools) {
      agentContextWithSubmit = withFinalSubmitToolSummary(withProcessDataDisplayToolSummary(agentContext), "turn");
      agentTools = withFinalSubmitTool(withProcessDataDisplayTool(tools), "turn");
    }
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("turn", agentContextWithSubmit, messages);
    const agent = treeTurnAgent ?? (createTreeTurnAgent(agentContextWithSubmit, env, agentTools) as unknown as TreeTurnAgentLike);
    if (runtimeHasTools) {
      const runtimeTools = agentTools as ToolsInput;
      const output = await streamRuntimeToolsThenStructure<TreeTurnPartial, DirectorTurnOutput>({
        agent,
        env,
        messages,
        onPartialObject,
        onProcessData,
        onReasoningText,
        schema: DirectorTurnOutputSchema,
        signal,
        target: "turn",
        tools: runtimeTools
      });
      logAiResponse("turn", "stream", output);
      return output;
    }

    let bestPartial: unknown = null;
    const output = await withStructuredOutputRetries(messages, "turn", async (attemptMessages) => {
      const stream = agent.stream
        ? await agent.stream(attemptMessages, {
            abortSignal: signal,
            ...executionOptionsForTools(tools),
            structuredOutput: structuredOutputForDirector(DirectorTurnOutputSchema, env, tools, "stream")
          })
        : null;

      if (!stream) throw new Error("Tree turn generation requires a streaming agent.");

      let latestPartial: unknown = null;
      if (stream.fullStream) {
        latestPartial = await consumeStructuredFullStream<TreeTurnPartial>(stream.fullStream, {
          logTarget: "turn",
          onPartialObject,
          onReasoningText
        });
      } else if (stream.objectStream) {
        for await (const partial of toAsyncIterable(stream.objectStream)) {
          logAiStream("turn", "partial", partial);
          latestPartial = partial;
          onPartialObject?.(partial as TreeTurnPartial);
        }
      }

      if (latestPartial !== null) bestPartial = latestPartial;
      const output = await resolveStructuredStreamOutput(stream, latestPartial ?? bestPartial);
      try {
        return DirectorTurnOutputSchema.parse(output);
      } catch (parseError) {
        logAiResponse("turn", "stream-parse-failed", output);
        throw parseError;
      }
    });
    logAiResponse("turn", "stream", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

export async function streamTreeArtifact({
  parts,
  signal,
  env,
  context,
  treeArtifactAgent,
  onPartialObject,
  onProcessData,
  onReasoningText
}: TreeDirectorExecutionInput & {
  treeArtifactAgent?: TreeArtifactAgentLike;
  onPartialObject?: (partial: TreeArtifactPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
}): Promise<DirectorArtifactOutput & DirectorAgentTrace> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeArtifactAgent));
  const { agentContext, tools } = executionContext;
  try {
    const runtimeHasTools = hasRuntimeTools(tools);
    let agentContextWithSubmit = agentContext;
    let agentTools = tools;
    if (runtimeHasTools) {
      agentContextWithSubmit = withFinalSubmitToolSummary(withProcessDataDisplayToolSummary(agentContext), "artifact");
      agentTools = withFinalSubmitTool(withProcessDataDisplayTool(tools), "artifact");
    }
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("artifact", agentContextWithSubmit, messages);
    const agent =
      treeArtifactAgent ?? (createTreeArtifactAgent(agentContextWithSubmit, env, agentTools) as unknown as TreeArtifactAgentLike);
    if (runtimeHasTools) {
      const runtimeTools = agentTools as ToolsInput;
      const output = await streamRuntimeToolsThenStructure<TreeArtifactPartial, DirectorArtifactOutput>({
        agent,
        env,
        messages,
        onPartialObject,
        onProcessData,
        onReasoningText,
        schema: DirectorArtifactOutputSchema,
        signal,
        target: "artifact",
        tools: runtimeTools
      });
      logAiResponse("artifact", "stream", output);
      return output;
    }

    let bestPartial: unknown = null;
    const output = await withStructuredOutputRetries(messages, "artifact", async (attemptMessages) => {
      const stream = agent.stream
        ? await agent.stream(attemptMessages, {
            abortSignal: signal,
            ...executionOptionsForTools(tools),
            structuredOutput: structuredOutputForDirector(DirectorArtifactOutputSchema, env, tools, "stream")
          })
        : null;

      if (!stream) {
        const output = await generateTreeArtifact({
          parts: { ...parts, messages: attemptMessages },
          signal,
          env,
          context,
          treeArtifactAgent: agent,
          suppressResponseLog: true
        });
        onPartialObject?.(output);
        return output;
      }

      let latestPartial: unknown = null;
      if (stream.fullStream) {
        latestPartial = await consumeStructuredFullStream<TreeArtifactPartial>(stream.fullStream, {
          logTarget: "artifact",
          onPartialObject,
          onReasoningText
        });
      } else if (stream.objectStream) {
        for await (const partial of toAsyncIterable(stream.objectStream)) {
          logAiStream("artifact", "partial", partial);
          latestPartial = partial;
          onPartialObject?.(partial as TreeArtifactPartial);
        }
      }

      if (latestPartial !== null) bestPartial = latestPartial;
      const output = await resolveStructuredStreamOutput(stream, latestPartial ?? bestPartial);
      try {
        return DirectorArtifactOutputSchema.parse(output);
      } catch (parseError) {
        logAiResponse("artifact", "stream-parse-failed", output);
        throw parseError;
      }
    });
    logAiResponse("artifact", "stream", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

export async function streamTreeOptions({
  parts,
  signal,
  env,
  context,
  treeOptionsAgent,
  onPartialObject,
  onProcessData,
  onReasoningText
}: TreeDirectorExecutionInput & {
  treeOptionsAgent?: TreeOptionsAgentLike;
  onPartialObject?: (partial: TreeOptionsPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
}): Promise<DirectorOptionsOutput & DirectorAgentTrace> {
  const executionContext = await executionContextForDirectorParts(parts, env, context, Boolean(treeOptionsAgent));
  const { agentContext, tools } = executionContext;
  try {
    const runtimeHasTools = hasRuntimeTools(tools);
    let agentContextWithSubmit = agentContext;
    let agentTools = tools;
    if (runtimeHasTools) {
      agentContextWithSubmit = withFinalSubmitToolSummary(withProcessDataDisplayToolSummary(agentContext), "options");
      agentTools = withFinalSubmitTool(withProcessDataDisplayTool(tools), "options");
    }
    const messages = directorMessagesForParts(parts, env);
    logMastraPrompt("options", agentContextWithSubmit, messages);
    const agent = treeOptionsAgent ?? (createTreeOptionsAgent(agentContextWithSubmit, env, agentTools) as unknown as TreeOptionsAgentLike);
    if (runtimeHasTools) {
      const runtimeTools = agentTools as ToolsInput;
      const output = await streamRuntimeToolsThenStructure<TreeOptionsPartial, DirectorOptionsOutput>({
        agent,
        env,
        messages,
        onPartialObject,
        onProcessData,
        onReasoningText,
        schema: DirectorOptionsOutputSchema,
        signal,
        target: "options",
        tools: runtimeTools
      });
      logAiResponse("options", "stream", output);
      return output;
    }

    let bestPartial: unknown = null;
    const output = await withStructuredOutputRetries(messages, "options", async (attemptMessages) => {
      const stream = agent.stream
        ? await agent.stream(attemptMessages, {
            abortSignal: signal,
            ...executionOptionsForTools(tools),
            structuredOutput: structuredOutputForDirector(DirectorOptionsOutputSchema, env, tools, "stream")
          })
        : null;

      if (!stream) throw new Error("Tree options generation requires a streaming agent.");

      let latestPartial: unknown = null;
      if (stream.fullStream) {
        latestPartial = await consumeStructuredFullStream<TreeOptionsPartial>(stream.fullStream, {
          logTarget: "options",
          onPartialObject,
          onReasoningText
        });
      } else if (stream.objectStream) {
        for await (const partial of toAsyncIterable(stream.objectStream)) {
          logAiStream("options", "partial", partial);
          latestPartial = partial;
          onPartialObject?.(partial as TreeOptionsPartial);
        }
      }

      if (latestPartial !== null) bestPartial = latestPartial;
      const output = await resolveStructuredStreamOutput(stream, latestPartial ?? bestPartial);
      try {
        return DirectorOptionsOutputSchema.parse(output);
      } catch (parseError) {
        logAiResponse("options", "stream-parse-failed", output);
        throw parseError;
      }
    });
    logAiResponse("options", "stream", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
}

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

function withFinalSubmitToolSummary(
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

function withProcessDataDisplayToolSummary(context: SharedAgentContextInput): SharedAgentContextInput {
  return {
    ...context,
    toolSummaries: [
      ...(context.toolSummaries ?? []),
      `${SHOW_PROCESS_DATA_TOOL_NAME}：向用户展示本轮工具调用后值得看见的过程数据。调用其他工具并检查返回值后，如果资料、搜索结果、参考清单或证据摘要会影响用户选择或理解，可在最终提交前调用；只展示本轮新调用工具后整理出的材料，不要重放历史 show_process_data，不要把最终 options 重复或改写成过程材料；如果本轮提交 options，过程材料必须支撑同一个 roundIntent 和三个 options，不能成为另一组 A/B/C 选项、候选题或选择清单；只提交通用展示结构 { title, sourceToolCallIds, items, note }，不要把原始工具输出或业务专用字段直接塞给 UI。`
    ]
  };
}

function withProcessDataDisplayTool(tools: ToolsInput): ToolsInput {
  return {
    ...tools,
    [SHOW_PROCESS_DATA_TOOL_NAME]: createTool({
      id: SHOW_PROCESS_DATA_TOOL_NAME,
      description:
        "Display user-facing process data from newly called and inspected tool results during this ReAct turn. Use before the final submit tool when the user should see source material or evidence. Do not replay historical show_process_data, duplicate final options, or create another A/B/C choice list. The UI renders exactly this generic display shape.",
      inputSchema: ShowProcessDataInputSchema,
      execute: async (input) => input
    })
  };
}

function withFinalSubmitTool(tools: ToolsInput, target: RuntimeSubmitTarget): ToolsInput {
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

function finalSubmitToolName(target: RuntimeSubmitTarget) {
  if (target === "turn") return `${SUBMIT_TREE_ARTIFACT_TOOL_NAME} 或 ${SUBMIT_TREE_OPTIONS_TOOL_NAME}`;
  return target === "artifact"
    ? SUBMIT_TREE_ARTIFACT_TOOL_NAME
    : target === "next-step"
      ? SUBMIT_TREE_NEXT_STEP_TOOL_NAME
      : SUBMIT_TREE_OPTIONS_TOOL_NAME;
}

function logAiResponse(target: RuntimeSubmitTarget, mode: "generate" | "stream" | "stream-parse-failed", response: unknown) {
  logTritreeAiResponse("ai-response", target, {
    mode,
    response
  });
}

function logAiStream(target: RuntimeSubmitTarget, event: "chunk" | "partial", value: unknown) {
  logTritreeAiStream("ai-stream", `${target}-${event}`, {
    value
  });
}

async function streamRuntimeToolsThenStructure<TPartial, TOutput>({
  agent,
  env,
  messages,
  onPartialObject,
  onProcessData,
  onReasoningText,
  schema,
  signal,
  target,
  tools
}: {
  agent: TreeArtifactAgentLike | TreeOptionsAgentLike;
  env: Record<string, string | undefined> | undefined;
  messages: MastraConversationMessage[];
  onPartialObject?: (partial: TPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
  schema: ParseableOutputSchema<TOutput>;
  signal?: AbortSignal;
  target: RuntimeSubmitTarget;
  tools: ToolsInput;
}): Promise<TOutput & DirectorAgentTrace> {
  return withStructuredOutputRetries(messages, target, async (attemptMessages) => {
    const { agentMessages, output } = await streamRuntimeToolsOnce<TPartial, TOutput>({
      agent,
      attemptMessages,
      env,
      onPartialObject,
      onProcessData,
      onReasoningText,
      schema,
      signal,
      target,
      tools
    });
    return withAgentMessages(output, agentMessages);
  }, { hasRuntimeTools: true });
}

function withAgentMessages<TOutput>(output: TOutput, agentMessages: AgentMessage[]): TOutput & DirectorAgentTrace {
  if (agentMessages.length === 0 || !isObjectRecord(output)) return output as TOutput & DirectorAgentTrace;
  return {
    ...output,
    agentMessages
  };
}

async function streamRuntimeToolsOnce<TPartial, TOutput>({
  agent,
  attemptMessages,
  env,
  onPartialObject,
  onProcessData,
  onReasoningText,
  schema,
  signal,
  target,
  tools
}: {
  agent: TreeArtifactAgentLike | TreeOptionsAgentLike;
  attemptMessages: MastraConversationMessage[];
  env: Record<string, string | undefined> | undefined;
  onPartialObject?: (partial: TPartial) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
  onReasoningText?: (event: ReasoningTextEvent) => void;
  schema: ParseableOutputSchema<TOutput>;
  signal?: AbortSignal;
  target: RuntimeSubmitTarget;
  tools: ToolsInput;
}): Promise<{ agentMessages: AgentMessage[]; output: TOutput }> {
  const stream = agent.stream
    ? await agent.stream(attemptMessages, {
        abortSignal: signal,
        ...executionOptionsForTools(tools)
      })
    : null;

  if (!stream) {
    if (target === "options") throw new Error("Tree options generation requires a streaming agent.");

    const result = await agent.generate(attemptMessages, {
      abortSignal: signal,
      ...executionOptionsForTools(tools),
      structuredOutput: structuredOutputForDirector(schema, env, tools, "generate")
    });
    return {
      agentMessages: [],
      output: schema.parse(unwrapMastraToolInput(result.object ?? result.output))
    };
  }

  const summary = await consumeRuntimeReActStream<TPartial>(stream, {
    onPartialObject,
    onProcessData,
    onReasoningText,
    signal,
    target
  });
  return {
    agentMessages: summary.agentMessages,
    output: await parseRuntimeReActStreamOutput(stream, summary, schema, target)
  };
}

async function consumeRuntimeReActStream<TPartial>(
  stream: StructuredObjectStreamResult,
  options: {
    onPartialObject?: (partial: TPartial) => void;
    onProcessData?: (data: ProcessDataDisplay) => void;
    onReasoningText?: (event: ReasoningTextEvent) => void;
    signal?: AbortSignal;
    target: RuntimeSubmitTarget;
  }
): Promise<RuntimeToolStreamSummary> {
  const streamStartedAt = Date.now();
  const streamShape = runtimeStreamShape(stream);
  const streamChunks: RuntimeStreamChunkSummary[] = [];
  let accumulatedProgressText = "";
  let hasSeenToolActivity = false;
  let hasSeenFinalSubmitOutput = false;
  let hiddenTextDebugOpen = false;
  let latestPartial: unknown = null;
  let previousProgressSegmentKind: ProgressSegmentKind | null = null;
  let rawText = "";
  let submittedOutput: unknown = undefined;
  const agentMessageHistoryState: AgentMessageHistoryState = {
    messages: [],
    toolCallIndexesById: new Map(),
    toolResultIds: new Set()
  };
  const toolCallDeltaState: ToolCallDeltaState = {
    announcedIds: new Set(),
    argsById: new Map(),
    processDataOutputById: new Map(),
    submittedOutputById: new Map(),
    toolNamesById: new Map()
  };

  if (stream.fullStream) {
    for await (const chunk of toAsyncIterable(stream.fullStream)) {
      streamChunks.push(summarizeRuntimeStreamChunk(chunk, streamChunks.length, "fullStream"));
      logAiStream(options.target, "chunk", chunk);
      const textDelta = textDeltaFromStreamChunk(chunk);
      const submittedDeltaOutput = submittedOutputDeltaFromStreamChunk(chunk, toolCallDeltaState);
      const submittedChunkOutput = submittedOutputFromStreamChunk(chunk);
      const processData = processDataDisplayFromStreamChunk(chunk, toolCallDeltaState);
      const reasoningDelta = hasSeenFinalSubmitOutput ? "" : reasoningDeltaFromStreamChunk(chunk);
      const toolProgressDelta =
        toolProgressDeltaFromStreamChunk(chunk) || toolCallDeltaProgressFromStreamChunk(chunk, toolCallDeltaState);
      collectAgentMessageFromStreamChunk(chunk, agentMessageHistoryState);
      const hasToolActivity = Boolean(toolProgressDelta);
      const visibleTextDelta = hasSeenFinalSubmitOutput ? "" : visibleRuntimeTextDelta(textDelta, rawText);
      const textPolicy = runtimeTextDeltaPolicy(textDelta, rawText, visibleTextDelta);
      const hiddenTextDebugDelta = hiddenTextDebugDeltaFromPolicy(textDelta, textPolicy, hiddenTextDebugOpen);
      const formattedProgress = formatProgressSegments(
        [
          { delta: reasoningDelta, kind: "text" },
          { delta: toolProgressDelta, kind: "tool" },
          { delta: visibleTextDelta, kind: "text" },
          { delta: hiddenTextDebugDelta, kind: "debug" }
        ],
        accumulatedProgressText,
        previousProgressSegmentKind
      );
      const visibleDelta = formattedProgress.delta;
      const partial = structuredObjectFromStreamChunk(chunk);

      const chunkPayloadForLog = isObjectRecord(chunk) && isObjectRecord((chunk as Record<string, unknown>).payload)
        ? (chunk as Record<string, unknown>).payload as Record<string, unknown>
        : isObjectRecord(chunk) ? chunk as Record<string, unknown> : {};
      const chunkToolNameForLog = toolNameFromPayload(chunkPayloadForLog);
      logTritreeAiDebug("react-stream", "chunk", {
        type: streamChunkTypeForLog(chunk),
        keys: streamChunkKeysForLog(chunk),
        toolName: chunkToolNameForLog || undefined,
        isFinalSubmit: chunkToolNameForLog ? isFinalSubmitToolName(chunkToolNameForLog) : undefined,
        reasoningChars: reasoningDelta.length,
        textChars: textDelta.length,
        textPolicy,
        toolProgressChars: toolProgressDelta.length,
        visibleChars: visibleDelta.length,
        rawTextCharsAfterChunk: rawText.length + textDelta.length,
        hasSeenToolActivity,
        hasToolActivity,
        partial: summarizePartialObjectForLog(partial),
        submittedDeltaOutput: summarizePartialObjectForLog(submittedDeltaOutput),
        submittedOutput: summarizePartialObjectForLog(submittedChunkOutput)
      });

      if (visibleDelta) {
        accumulatedProgressText += visibleDelta;
        previousProgressSegmentKind = formattedProgress.lastKind;
        options.onReasoningText?.({
          delta: visibleDelta,
          accumulatedText: accumulatedProgressText
        });
      }

      if (processData) {
        options.onProcessData?.(processData);
      }

      if (hiddenTextDebugDelta) {
        hiddenTextDebugOpen = true;
      } else if (textPolicy !== "hidden" && textDelta.trim()) {
        hiddenTextDebugOpen = false;
      }

      rawText += textDelta;
      hasSeenToolActivity = hasSeenToolActivity || hasToolActivity;

      if (partial !== undefined) {
        logAiStream(options.target, "partial", partial);
        latestPartial = partial;
        options.onPartialObject?.(partial as TPartial);
      }

      if (submittedDeltaOutput !== undefined) {
        logAiStream(options.target, "partial", submittedDeltaOutput);
        submittedOutput = submittedDeltaOutput;
        latestPartial = submittedDeltaOutput;
        options.onPartialObject?.(submittedDeltaOutput as TPartial);
      }

      if (submittedChunkOutput !== undefined) {
        logAiStream(options.target, "partial", submittedChunkOutput);
        submittedOutput = submittedChunkOutput;
        latestPartial = submittedChunkOutput;
        options.onPartialObject?.(submittedChunkOutput as TPartial);
      }

      hasSeenFinalSubmitOutput =
        hasSeenFinalSubmitOutput || submittedDeltaOutput !== undefined || submittedChunkOutput !== undefined;
      if (submittedChunkOutput !== undefined) {
        break;
      }
    }
    return {
      abortSignalAborted: Boolean(options.signal?.aborted),
      abortSignalReason: summarizeJsonValue(options.signal?.reason, 1000),
      agentMessages: agentMessageHistoryState.messages,
      latestPartial,
      rawText,
      streamChunkCount: streamChunks.length,
      streamChunks,
      streamDurationMs: Date.now() - streamStartedAt,
      streamShape,
      submittedOutput
    };
  }

  if (stream.objectStream) {
    for await (const partial of toAsyncIterable(stream.objectStream)) {
      streamChunks.push(summarizeRuntimeStreamChunk(partial, streamChunks.length, "objectStream"));
      logAiStream(options.target, "partial", partial);
      latestPartial = partial;
      options.onPartialObject?.(partial as TPartial);
    }
  } else {
    const output = await resolveLooseStreamOutput(stream);
    if (output !== undefined) {
      rawText = summarizeJsonValue(output, 4000);
    }
  }

  return {
    abortSignalAborted: Boolean(options.signal?.aborted),
    abortSignalReason: summarizeJsonValue(options.signal?.reason, 1000),
    agentMessages: agentMessageHistoryState.messages,
    latestPartial,
    rawText,
    streamChunkCount: streamChunks.length,
    streamChunks,
    streamDurationMs: Date.now() - streamStartedAt,
    streamShape,
    submittedOutput
  };
}

async function parseRuntimeReActStreamOutput<TOutput>(
  stream: StructuredObjectStreamResult,
  summary: RuntimeToolStreamSummary,
  schema: ParseableOutputSchema<TOutput>,
  target: RuntimeSubmitTarget
) {
  let streamError: unknown;
  logTritreeAiDebug("react-stream", "parse-start", {
    target,
    rawTextChars: summary.rawText.length,
    rawTextPreview: summary.rawText,
    latestPartial: summarizePartialObjectForLog(summary.latestPartial),
    submittedOutput: summarizePartialObjectForLog(summary.submittedOutput)
  });

  if (summary.submittedOutput !== undefined) {
    try {
      const parsed = schema.parse(summary.submittedOutput);
      assertMeaningfulRuntimeAction({ output: parsed, summary, target });
      logTritreeAiDebug("react-stream", "parse-submit-success", {
        target,
        output: summarizePartialObjectForLog(parsed)
      });
      return parsed;
    } catch (error) {
      if (summary.abortSignalAborted) {
        throw runtimeStreamAbortError(summary);
      }

      logTritreeAiDebug("react-stream", "parse-submit-failed", {
        target,
        error: summarizeErrorForLog(error)
      });
      logAiResponse(target, "stream-parse-failed", summary.submittedOutput);
      logZodIssues(target, "submit", error);
      throw error;
    }
  }

  if (shouldTreatRuntimeStreamAsAborted(summary)) {
    const error = runtimeStreamAbortError(summary);
    logTritreeAiDebug("react-stream", "parse-aborted", {
      target,
      error: summarizeErrorForLog(error)
    });
    throw error;
  }

  try {
    const output = await resolveStructuredStreamOutput(stream, summary.latestPartial);
    const parsed = schema.parse(output);
    assertMeaningfulRuntimeAction({ output: parsed, summary, target });
    logTritreeAiDebug("react-stream", "parse-structured-success", {
      target,
      output: summarizePartialObjectForLog(parsed)
    });
    return parsed;
  } catch (error) {
    streamError = error;
    logTritreeAiDebug("react-stream", "parse-structured-failed", {
      target,
      error: summarizeErrorForLog(error)
    });
    logZodIssues(target, "structured", error);
  }

  if (summary.rawText.trim() && !isActualWorkRetryError(streamError)) {
    streamError = finalSubmitToolRequiredError(target);
    logTritreeAiDebug("react-stream", "parse-final-submit-missing", {
      target,
      error: summarizeErrorForLog(streamError)
    });
    logZodIssues(target, "missing-submit", streamError);
  }

  logTritreeAiDebug("react-stream", "parse-failed", {
    target,
    error: summarizeErrorForLog(streamError)
  });
  logRuntimeStreamParseFailure(target, summary, streamError);
  logAiResponse(target, "stream-parse-failed", summary.latestPartial);
  throw streamError;
}

function assertMeaningfulRuntimeAction({
  output,
  summary,
  target
}: {
  output: unknown;
  summary: RuntimeToolStreamSummary;
  target: RuntimeSubmitTarget;
}) {
  if (target === "artifact") return;
  if (hasNonFinalToolActivity(summary)) return;
  if (target === "turn" && isObjectRecord(output) && output.action === "artifact") return;
  if (target === "turn" && isObjectRecord(output) && Object.prototype.hasOwnProperty.call(output, "artifact")) return;
  if (target === "next-step" && isObjectRecord(output) && (output.action === "artifact" || output.action === "complete")) {
    return;
  }
  if ((target === "options" || target === "next-step") && hasUserFacingOptions(output)) {
    return;
  }
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
  return summary.streamChunks.some((chunk) => chunk.toolName && !isFinalSubmitToolName(chunk.toolName));
}

function hasDecisionRationale(output: unknown) {
  return isObjectRecord(output) && typeof output.decisionRationale === "string" && output.decisionRationale.trim().length > 0;
}

function hasUserFacingOptions(output: unknown) {
  if (!isObjectRecord(output) || typeof output.roundIntent !== "string" || !output.roundIntent.trim()) return false;
  if (!Array.isArray(output.options) || output.options.length !== 3) return false;

  return output.options.every(
    (option) =>
      isObjectRecord(option) &&
      typeof option.label === "string" &&
      option.label.trim().length > 0 &&
      typeof option.description === "string" &&
      option.description.trim().length > 0
  );
}

function isActualWorkRetryError(error: unknown) {
  return zodIssuesFromError(error).some(
    (issue) => issue.path.join(".") === "decisionRationale" && issue.message === ACTUAL_WORK_RETRY_MESSAGE
  );
}

function shouldTreatRuntimeStreamAsAborted(summary: RuntimeToolStreamSummary) {
  if (!summary.abortSignalAborted || summary.submittedOutput !== undefined) return false;
  return hasAbortStreamChunk(summary) || (summary.latestPartial === null && !summary.rawText.trim());
}

function hasAbortStreamChunk(summary: RuntimeToolStreamSummary) {
  return summary.streamChunks.some((chunk) => chunk.type === "abort");
}

function runtimeStreamAbortError(summary: RuntimeToolStreamSummary) {
  const message = summary.abortSignalReason
    ? `AI stream aborted before final output. Reason: ${summary.abortSignalReason}`
    : "AI stream aborted before final output.";
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function finalSubmitToolRequiredError(target: RuntimeSubmitTarget) {
  return new ZodError([
    {
      code: "custom",
      path: [],
      message: `必须调用 ${finalSubmitToolName(target)} 工具提交最终结果，不能把最终 JSON、Markdown 或正文写成普通文本。`
    }
  ]);
}

function logZodIssues(target: RuntimeSubmitTarget, stage: string, error: unknown) {
  const issues = zodIssuesFromError(error);
  if (issues.length === 0) return;
  console.info(
    `[treeable:generate-artifact-stream:zod-issues:${target}:${stage}]`,
    JSON.stringify(
      issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "root",
        code: issue.code,
        message: issue.message,
        received: "received" in issue ? issue.received : undefined
      })),
      null,
      2
    )
  );
}

function logRuntimeStreamParseFailure(target: RuntimeSubmitTarget, summary: RuntimeToolStreamSummary, error: unknown) {
  console.info(
    `[tritree:ai-response:${target}:stream-parse-failed-details]`,
    stringifyDiagnosticValue({
      abortSignalAborted: summary.abortSignalAborted,
      abortSignalReason: summary.abortSignalReason,
      agentMessageCount: summary.agentMessages.length,
      agentMessages: summary.agentMessages,
      error: summarizeErrorForLog(error),
      latestPartial: summary.latestPartial ?? null,
      rawTextChars: summary.rawText.length,
      rawTextPreview: truncateText(summary.rawText, 12000),
      streamChunkCount: summary.streamChunkCount,
      streamChunks: summary.streamChunks.slice(0, 40),
      streamDurationMs: summary.streamDurationMs,
      streamShape: summary.streamShape,
      submittedOutput: summary.submittedOutput ?? null,
      target
    })
  );
}

function runtimeStreamShape(stream: StructuredObjectStreamResult): RuntimeStreamShape {
  return {
    hasFullStream: stream.fullStream !== undefined,
    hasObject: stream.object !== undefined,
    hasObjectStream: stream.objectStream !== undefined,
    hasOutput: stream.output !== undefined
  };
}

function summarizeRuntimeStreamChunk(
  chunk: unknown,
  index: number,
  source: RuntimeStreamChunkSummary["source"]
): RuntimeStreamChunkSummary {
  const payload = isObjectRecord(chunk) && isObjectRecord(chunk.payload) ? chunk.payload : null;
  const toolName = payload ? toolNameFromPayload(payload) : isObjectRecord(chunk) ? toolNameFromPayload(chunk) : "";
  return {
    index,
    keys: streamChunkKeysForLog(chunk),
    ...(payload ? { payloadKeys: Object.keys(payload).slice(0, 12) } : {}),
    reasoningChars: reasoningDeltaFromStreamChunk(chunk).length,
    source,
    submittedOutput: submittedOutputFromStreamChunk(chunk) !== undefined,
    textChars: textDeltaFromStreamChunk(chunk).length,
    ...(toolName ? { toolName } : {}),
    type: streamChunkTypeForLog(chunk)
  };
}

function stringifyDiagnosticValue(value: unknown) {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Error) {
        return {
          message: item.message,
          name: item.name,
          stack: item.stack
        };
      }

      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }

      return item;
    },
    2
  );
  return text ?? String(value);
}

function normalizeOptionKind(value: string | undefined, index: number): BranchOption["kind"] {
  if (value?.startsWith("explore")) return "explore";
  if (value?.startsWith("deepen")) return "deepen";
  if (value?.startsWith("reframe")) return "reframe";
  if (value?.startsWith("finish")) return "finish";
  return index === 0 ? "explore" : index === 1 ? "deepen" : "reframe";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function resolveLooseStreamOutput(stream: StructuredObjectStreamResult) {
  if (stream.output !== undefined) {
    return stream.output instanceof Promise ? await stream.output : stream.output;
  }
  if (stream.object !== undefined) {
    return stream.object instanceof Promise ? await stream.object : stream.object;
  }
  return undefined;
}

async function withStructuredOutputRetries<T>(
  messages: MastraConversationMessage[],
  target: RuntimeSubmitTarget,
  run: (messages: MastraConversationMessage[]) => Promise<T>,
  options?: { hasRuntimeTools?: boolean }
): Promise<T> {
  let attemptMessages = messages;

  for (let retryIndex = 0; retryIndex <= MAX_STRUCTURED_OUTPUT_RETRIES; retryIndex += 1) {
    try {
      return await run(attemptMessages);
    } catch (error) {
      if (!isStructuredOutputValidationError(error) || retryIndex === MAX_STRUCTURED_OUTPUT_RETRIES) {
        throw error;
      }

      attemptMessages = [
        ...messages,
        structuredOutputRepairMessage({
          error,
          retryNumber: retryIndex + 1,
          target,
          hasRuntimeTools: options?.hasRuntimeTools
        })
      ];
    }
  }

  throw new Error("Structured output retry loop exited unexpectedly.");
}

function structuredOutputRepairMessage({
  error,
  retryNumber,
  target,
  hasRuntimeTools: runtimeTools
}: {
  error: unknown;
  retryNumber: number;
  target: RuntimeSubmitTarget;
  hasRuntimeTools?: boolean;
}): MastraConversationMessage {
  const submitToolName = finalSubmitToolName(target);
  const runtimeReminder = runtimeTools
    ? `\n必须调用 ${submitToolName} 工具提交最终结果，不要直接输出 JSON 或 Markdown 文本。`
    : "";
  return {
    role: "user",
    content: [
      `上一轮最终输出没有通过 Tritree 固定结构校验。请根据原始任务、已启用 Skills 和已经获得的工具结果，重新生成一个完整合法的最终结果。`,
      `结构修复重试 ${retryNumber}/${MAX_STRUCTURED_OUTPUT_RETRIES}。不要解释错误原因，不要输出诊断报告。${runtimeReminder}`,
      "结构问题：",
      structuredOutputIssueSummary(error),
      "最终结构要求：",
      target === "turn"
        ? turnOutputShapeSummary()
        : target === "artifact"
        ? artifactOutputShapeSummary()
        : target === "next-step"
          ? nextStepOutputShapeSummary()
          : optionsOutputShapeSummary()
    ].join("\n")
  };
}

function isStructuredOutputValidationError(error: unknown): boolean {
  return error instanceof ZodError || hasMastraStructuredOutputValidationError(error);
}

function hasMastraStructuredOutputValidationError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.id === MASTRA_STRUCTURED_OUTPUT_VALIDATION_ID) return true;
  return hasMastraStructuredOutputValidationError((error as { cause?: unknown }).cause);
}

function structuredOutputIssueSummary(error: unknown) {
  const issues = zodIssuesFromError(error);
  if (issues.length > 0) {
    return issues.slice(0, 8).map(formatZodIssue).join("\n");
  }

  const value = findMastraStructuredOutputValidationValue(error);
  if (value !== undefined) {
    return `root: 结构化输出值无效，收到 ${summarizeInvalidStructuredValue(value)}`;
  }

  if (error instanceof Error) return error.message;
  return String(error);
}

function zodIssuesFromError(error: unknown): ZodIssue[] {
  if (error instanceof ZodError) return error.issues;
  if (!isRecord(error)) return [];
  const causeIssues = zodIssuesFromError((error as { cause?: unknown }).cause);
  if (causeIssues.length > 0) return causeIssues;
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues)) return issues.filter(isZodIssue);
  return [];
}

function isZodIssue(value: unknown): value is ZodIssue {
  return isRecord(value) && typeof value.message === "string" && Array.isArray(value.path);
}

function formatZodIssue(issue: ZodIssue) {
  const path = issue.path.length > 0 ? issue.path.join(".") : "root";
  return `${path}: ${issue.message}`;
}

function summarizeInvalidStructuredValue(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return String(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function artifactOutputShapeSummary() {
  return [
    "必须返回对象：{ roundIntent, artifact }。",
    "artifact 可以是 null；如果产生产物，必须包含 { type, payload }，payload 结构由对应产物插件决定。"
  ].join("\n");
}

function optionsOutputShapeSummary() {
  return [
    "必须返回对象：{ roundIntent, options }。",
    "options 必须正好 3 项，id 必须分别是 a、b、c 且只出现一次。",
    "每个 option 必须包含 { id, label, description, impact, kind }；kind 只能是 explore、deepen、reframe 或 finish。"
  ].join("\n");
}

function nextStepOutputShapeSummary() {
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

function turnOutputShapeSummary() {
  return [
    "必须调用一个最终提交工具：submit_tree_artifact 或 submit_tree_options。",
    "submit_tree_artifact 参数必须是 { roundIntent, artifact }；artifact 可以是 null；如果产生产物，artifact 必须包含 { type, payload }。",
    "submit_tree_options 参数必须是 { roundIntent, options }；options 必须正好 3 项，id 必须分别是 a、b、c 且只出现一次。"
  ].join("\n");
}

async function executionContextForDirectorParts(
  parts: DirectorInputParts,
  env: Record<string, string | undefined> | undefined,
  context: Partial<AgentExecutionContextOverride> = {},
  skipRuntimeTools = false,
  toolPolicy: DirectorRuntimeToolPolicy = {}
) {
  const baseContext = contextForDirectorParts(parts, context);
  if (skipRuntimeTools) {
    return {
      agentContext: baseContext,
      disconnect: async () => undefined,
      tools: undefined as ToolsInput | undefined
    };
  }

  const runtime = await createSkillRuntimeTools(baseContext.enabledSkills);
  const mcpRuntime = await createMcpRuntimeTools({ existingTools: runtime.tools });
  const runtimeEnabledSkills = Array.isArray(runtime.enabledSkills) ? runtime.enabledSkills : baseContext.enabledSkills;
  const runtimeAvailableSkillSummaries = Array.isArray(runtime.availableSkillSummaries)
    ? runtime.availableSkillSummaries
    : [];
  const includeSubagentTools = toolPolicy.includeSubagentTools ?? true;
  const subagentRuntime = includeSubagentTools
    ? createSubagentRuntimeTools({ contextSource: parts, env })
    : { subagentTemplateSummaries: [], toolSummaries: [], tools: {} };
  const tools = {
    ...(runtime.tools ?? {}),
    ...(mcpRuntime.tools ?? {}),
    ...subagentRuntime.tools
  };
  return {
    agentContext: {
      ...baseContext,
      availableSkillSummaries: [
        ...(baseContext.availableSkillSummaries ?? []),
        ...runtimeAvailableSkillSummaries
      ],
      enabledSkills: runtimeEnabledSkills,
      subagentTemplateSummaries: [
        ...(baseContext.subagentTemplateSummaries ?? []),
        ...subagentRuntime.subagentTemplateSummaries
      ],
      toolSummaries: [
        ...(baseContext.toolSummaries ?? []),
        ...runtime.toolSummaries,
        ...mcpRuntime.toolSummaries,
        ...subagentRuntime.toolSummaries
      ]
    },
    disconnect: () => disconnectRuntimeTools(mcpRuntime),
    tools
  };
}

async function disconnectRuntimeTools(runtime: Pick<McpRuntimeTools, "disconnect">) {
  try {
    await runtime.disconnect();
  } catch (error) {
    logTritreeAiDebug("mcp-runtime", "disconnect-failed", { error });
  }
}

function executionOptionsForTools(tools: ToolsInput | undefined) {
  if (!tools || Object.keys(tools).length === 0) return {};
  return {
    maxSteps: 20,
    toolCallConcurrency: 1,
    toolChoice: "auto" as const
  };
}

function structuredOutputForDirector<TSchema>(
  schema: TSchema,
  env: Record<string, string | undefined> | undefined,
  tools: ToolsInput | undefined,
  mode: "generate" | "stream"
) {
  if (hasRuntimeTools(tools)) {
    return {
      schema,
      model: createTreeableAnthropicModel(env)
    };
  }

  return mode === "stream" ? streamingStructuredOutput(schema) : { schema };
}

function normalizeSkill(skill: Skill): Skill {
  return {
    ...skill,
    appliesTo: skill.appliesTo ?? "both",
    defaultEnabled: skill.defaultEnabled ?? false,
    isArchived: skill.isArchived ?? false
  };
}

function directorMessagesForParts(
  parts: DirectorInputParts,
  env: Record<string, string | undefined> | undefined
): MastraConversationMessage[] {
  return compactDirectorMessagesForModel(parts.messages ?? [{ role: "user", content: buildDirectorInput(parts) }], env);
}

function streamingStructuredOutput<TSchema>(schema: TSchema) {
  return { schema, jsonPromptInjection: true };
}

function hasRuntimeTools(tools: ToolsInput | undefined): tools is ToolsInput {
  return Boolean(tools && Object.keys(tools).length > 0);
}

async function consumeStructuredFullStream<TPartial>(
  fullStream: StreamSource<unknown>,
  options: {
    logTarget: RuntimeSubmitTarget;
    onPartialObject?: (partial: TPartial) => void;
    onReasoningText?: (event: ReasoningTextEvent) => void;
  }
) {
  let latestPartial: unknown = null;
  let accumulatedProgressText = "";
  let previousProgressSegmentKind: ProgressSegmentKind | null = null;

  for await (const chunk of toAsyncIterable(fullStream)) {
    logAiStream(options.logTarget, "chunk", chunk);
    const formattedProgress = formatProgressSegments(
      progressSegmentsFromStreamChunk(chunk),
      accumulatedProgressText,
      previousProgressSegmentKind
    );
    const progressDelta = formattedProgress.delta;
    if (progressDelta) {
      accumulatedProgressText += progressDelta;
      previousProgressSegmentKind = formattedProgress.lastKind;
      options.onReasoningText?.({
        delta: progressDelta,
        accumulatedText: accumulatedProgressText
      });
    }

    const partial = structuredObjectFromStreamChunk(chunk);
    if (partial !== undefined) {
      logAiStream(options.logTarget, "partial", partial);
      latestPartial = partial;
      options.onPartialObject?.(partial as TPartial);
    }
  }

  return latestPartial;
}

function progressSegmentsFromStreamChunk(chunk: unknown): ProgressSegment[] {
  const segments: ProgressSegment[] = [
    { delta: reasoningDeltaFromStreamChunk(chunk), kind: "text" },
    { delta: toolProgressDeltaFromStreamChunk(chunk), kind: "tool" }
  ];

  return segments.filter((segment) => Boolean(segment.delta));
}

function formatProgressSegments(
  segments: ProgressSegment[],
  accumulatedProgressText: string,
  previousKind: ProgressSegmentKind | null
) {
  let delta = "";
  let lastKind = previousKind;

  for (const segment of segments) {
    if (!segment.delta) continue;

    const currentText = `${accumulatedProgressText}${delta}`;
    const segmentDelta = shouldSeparateProgressSegments(lastKind, segment.kind, currentText, segment.delta)
      ? `\n${segment.delta}`
      : segment.delta;
    delta += segmentDelta;
    lastKind = segment.kind;
  }

  return { delta, lastKind };
}

function shouldSeparateProgressSegments(
  previousKind: ProgressSegmentKind | null,
  nextKind: ProgressSegmentKind,
  currentText: string,
  nextDelta: string
) {
  if (!previousKind || previousKind === nextKind) return false;
  if (!currentText || currentText.endsWith("\n") || nextDelta.startsWith("\n")) return false;
  return previousKind === "tool" || nextKind === "tool";
}

function reasoningDeltaFromStreamChunk(chunk: unknown) {
  if (!isRecord(chunk)) return "";

  if (chunk.type === "reasoning-delta") {
    if (isRecord(chunk.payload) && typeof chunk.payload.text === "string") return chunk.payload.text;
    if (typeof chunk.delta === "string") return chunk.delta;
    if (typeof chunk.text === "string") return chunk.text;
  }

  if (
    chunk.type === "content_block_delta" &&
    isRecord(chunk.delta) &&
    chunk.delta.type === "thinking_delta" &&
    typeof chunk.delta.thinking === "string"
  ) {
    return chunk.delta.thinking;
  }

  return "";
}

function textDeltaFromStreamChunk(chunk: unknown) {
  if (!isRecord(chunk)) return "";

  if (chunk.type === "text-delta") {
    if (isRecord(chunk.payload) && typeof chunk.payload.text === "string") return chunk.payload.text;
    if (typeof chunk.delta === "string") return chunk.delta;
    if (typeof chunk.text === "string") return chunk.text;
  }

  if (
    chunk.type === "content_block_delta" &&
    isRecord(chunk.delta) &&
    chunk.delta.type === "text_delta" &&
    typeof chunk.delta.text === "string"
  ) {
    return chunk.delta.text;
  }

  return "";
}

function visibleRuntimeTextDelta(textDelta: string, accumulatedRawText: string) {
  if (!textDelta.trim()) return "";
  if (looksLikeStructuredRuntimeText(textDelta) || looksLikeStructuredRuntimeText(`${accumulatedRawText}${textDelta}`)) {
    return "";
  }
  return textDelta;
}

function runtimeTextDeltaPolicy(
  textDelta: string,
  accumulatedRawText: string,
  visibleTextDelta: string
) {
  if (!textDelta.trim()) return "empty";
  if (visibleTextDelta) return "visible";
  if (looksLikeStructuredRuntimeText(textDelta) || looksLikeStructuredRuntimeText(`${accumulatedRawText}${textDelta}`)) {
    return "structured-hidden";
  }
  return "hidden";
}

function hiddenTextDebugDeltaFromPolicy(textDelta: string, textPolicy: string, isOpen: boolean) {
  if (textPolicy !== "hidden" || !textDelta) return "";
  return isOpen ? textDelta : `\n[调试 hidden textPolicy=hidden]\n${textDelta}`;
}

function looksLikeStructuredRuntimeText(text: string) {
  const trimmed = text.trimStart();
  if (!trimmed) return false;
  if (trimmed.startsWith("```")) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) return true;
  if (/"(roundIntent|options|artifact)"\s*:/.test(trimmed)) return true;
  if (/(^|\n)\s*(?:\*\*)?(roundIntent|description|impact|kind|选项\s*[a-cA-C])(?:\*\*)?\s*[：:]/.test(trimmed)) {
    return true;
  }

  const structuralChars = trimmed.match(/[{}\[\]":,]/g)?.length ?? 0;
  return trimmed.length > 80 && structuralChars / trimmed.length > 0.16;
}

function toolProgressDeltaFromStreamChunk(chunk: unknown): string {
  if (!isObjectRecord(chunk)) return "";

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) return toolProgressDeltaFromStreamChunk(nestedAgentChunk);

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (!chunkType.includes("tool")) return "";

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const toolName = toolNameFromPayload(payload);
  if (!toolName) return "";
  if (isFinalSubmitToolName(toolName)) return "";
  if (isProcessDataDisplayToolName(toolName)) return "";

  if (chunkType === "tool-call" || chunkType === "tool-execution-start") {
    if (isSubagentToolName(toolName)) {
      return `\n[子代理] 运行 ${subagentCallLabel(toolName, toolInputFromPayload(payload))}`;
    }

    return `\n[工具] 调用 ${toolName}`;
  }

  if (chunkType === "tool-result" || chunkType === "tool-output" || chunkType === "tool-execution-end") {
    const output = toolOutputFromPayload(payload);
    const verb = isFailedToolOutput(output, payload) ? "失败" : "完成";
    if (isSubagentToolName(toolName)) {
      return `\n[子代理] ${subagentResultTitle(toolName, output)} ${
        verb === "失败" ? "失败" : "完成，主 agent 正在检查返回值"
      }`;
    }

    return `\n[工具] ${toolName} ${verb}`;
  }

  if (chunkType === "tool-error" || chunkType === "tool-execution-abort") {
    if (isSubagentToolName(toolName)) {
      return `\n[子代理] ${subagentToolFallbackTitle(toolName)} 失败`;
    }

    return `\n[工具] ${toolName} 失败`;
  }

  return "";
}

function toolCallDeltaProgressFromStreamChunk(chunk: unknown, state: ToolCallDeltaState): string {
  if (!isObjectRecord(chunk)) return "";

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) return toolCallDeltaProgressFromStreamChunk(nestedAgentChunk, state);

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (chunkType !== "tool-call-streaming-start" && chunkType !== "tool-call-delta") return "";

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const { toolCallId, toolName } = streamedToolIdentity(payload, state);
  if (!toolName) return "";
  if (isFinalSubmitToolName(toolName)) return "";
  if (isProcessDataDisplayToolName(toolName)) return "";

  if (chunkType === "tool-call-streaming-start") {
    state.argsById.set(toolCallId, "");
    if (state.announcedIds.has(toolCallId)) return "";
    state.announcedIds.add(toolCallId);
    if (isSubagentToolName(toolName)) {
      return `\n[子代理] 准备运行 ${subagentToolFallbackTitle(toolName)}`;
    }

    return `\n[工具] 准备调用 ${toolName}`;
  }

  const argsTextDelta = stringFromPayload(payload, "argsTextDelta", "delta", "text");
  if (!argsTextDelta) return "";

  state.argsById.set(toolCallId, `${state.argsById.get(toolCallId) ?? ""}${argsTextDelta}`);
  if (state.announcedIds.has(toolCallId)) return "";

  state.announcedIds.add(toolCallId);
  return `\n[工具] 准备调用 ${toolName}`;
}

function isSubagentToolName(toolName: string) {
  return toolName === RUN_SUBAGENT_TEMPLATE_TOOL_NAME || toolName === RUN_CUSTOM_SUBAGENT_TOOL_NAME;
}

function isProcessDataDisplayToolName(toolName: string) {
  return toolName === SHOW_PROCESS_DATA_TOOL_NAME;
}

function processDataDisplayFromStreamChunk(chunk: unknown, state: ToolCallDeltaState): ProcessDataDisplay | null {
  if (!isObjectRecord(chunk)) return null;

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) return processDataDisplayFromStreamChunk(nestedAgentChunk, state);

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (!chunkType.includes("tool")) return null;

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const { toolCallId, toolName } = streamedToolIdentity(payload, state);
  if (!isProcessDataDisplayToolName(toolName)) return null;

  if (chunkType === "tool-call-streaming-start") {
    state.argsById.set(toolCallId, "");
    state.processDataOutputById.delete(toolCallId);
    return null;
  }

  if (chunkType === "tool-call-delta") {
    const argsTextDelta = stringFromPayload(payload, "argsTextDelta", "delta", "text");
    if (!argsTextDelta) return null;

    const argsText = `${state.argsById.get(toolCallId) ?? ""}${argsTextDelta}`;
    state.argsById.set(toolCallId, argsText);
    return dedupeProcessDataDisplay(toolCallId, partialProcessDataDisplayFromArgsText(argsText), state);
  }

  const rawValue =
    chunkType === "tool-call" || chunkType === "tool-execution-start"
      ? parseMaybeJson(toolInputFromPayload(payload))
      : chunkType === "tool-result" || chunkType === "tool-output" || chunkType === "tool-execution-end"
        ? parseMaybeJson(unwrapToolOutputValue(toolOutputFromPayload(payload)))
        : null;
  const parsed = ShowProcessDataInputSchema.safeParse(rawValue);
  if (!parsed.success) return null;

  return dedupeProcessDataDisplay(toolCallId, parsed.data, state);
}

function partialProcessDataDisplayFromArgsText(argsText: string): ProcessDataDisplay | null {
  const parsed = ShowProcessDataInputSchema.safeParse(parseMaybeJson(argsText));
  if (parsed.success) return parsed.data;

  const fields = extractVisibleJsonObjectFields(argsText);
  const title = typeof fields.title === "string" ? fields.title : "";
  const rawItems = Array.isArray(fields.items) ? fields.items : [];
  const items = rawItems
    .map(processDataDisplayItemFromValue)
    .filter((item): item is ProcessDataDisplay["items"][number] => Boolean(item));
  if (!title.trim() || items.length === 0) return null;

  const candidate: ProcessDataDisplay = {
    title,
    sourceToolCallIds: stringArrayValue(fields.sourceToolCallIds),
    items,
    ...(typeof fields.note === "string" && fields.note.trim() ? { note: fields.note } : {})
  };
  const candidateParsed = ShowProcessDataInputSchema.safeParse(candidate);
  return candidateParsed.success ? candidateParsed.data : null;
}

function processDataDisplayItemFromValue(value: unknown): ProcessDataDisplay["items"][number] | null {
  if (!isObjectRecord(value)) return null;

  const title = typeof value.title === "string" ? value.title : "";
  if (!title.trim()) return null;

  return {
    title,
    ...(typeof value.subtitle === "string" && value.subtitle.trim() ? { subtitle: value.subtitle } : {}),
    ...(typeof value.meta === "string" && value.meta.trim() ? { meta: value.meta } : {}),
    ...(typeof value.url === "string" && value.url.trim() ? { url: value.url } : {})
  };
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function dedupeProcessDataDisplay(
  toolCallId: string,
  data: ProcessDataDisplay | null,
  state: ToolCallDeltaState
): ProcessDataDisplay | null {
  if (!data) return null;

  const payloadKey = JSON.stringify(data);
  const emitKey = toolCallId || payloadKey;
  if (state.processDataOutputById.get(emitKey) === payloadKey) return null;

  state.processDataOutputById.set(emitKey, payloadKey);
  return data;
}

function unwrapToolOutputValue(output: unknown) {
  if (!isObjectRecord(output)) return output;
  if (output.type === "json" && Object.prototype.hasOwnProperty.call(output, "value")) return output.value;
  return output;
}

function subagentCallLabel(toolName: string, input: unknown) {
  const parsedInput = parseMaybeJson(input);
  if (!isObjectRecord(parsedInput)) return subagentToolFallbackTitle(toolName);

  const templateId = typeof parsedInput.templateId === "string" ? parsedInput.templateId : "";
  const templateTitle = templateId ? getSubagentTemplate(templateId)?.title : "";
  const customTitle = typeof parsedInput.title === "string" ? parsedInput.title.trim() : "";
  const title = templateTitle || customTitle || subagentToolFallbackTitle(toolName);
  const task = typeof parsedInput.task === "string" ? truncateText(parsedInput.task, 80) : "";
  return task ? `${title}：${task}` : title;
}

function subagentResultTitle(toolName: string, output: unknown) {
  const parsedOutput = parseMaybeJson(output);
  if (!isObjectRecord(parsedOutput)) return subagentToolFallbackTitle(toolName);

  const title = typeof parsedOutput.title === "string" ? parsedOutput.title.trim() : "";
  if (title) return title;

  const templateId = typeof parsedOutput.templateId === "string" ? parsedOutput.templateId : "";
  return (templateId ? getSubagentTemplate(templateId)?.title : "") || subagentToolFallbackTitle(toolName);
}

function subagentToolFallbackTitle(toolName: string) {
  return toolName === RUN_SUBAGENT_TEMPLATE_TOOL_NAME ? "预定义子代理" : "自定义子代理";
}

function collectAgentMessageFromStreamChunk(chunk: unknown, state: AgentMessageHistoryState) {
  if (!isObjectRecord(chunk)) return;

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) {
    collectAgentMessageFromStreamChunk(nestedAgentChunk, state);
    return;
  }

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (!chunkType.includes("tool")) return;

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const toolName = toolNameFromPayload(payload);
  if (!toolName || isFinalSubmitToolName(toolName)) return;
  const toolCallId = stringFromPayload(payload, "toolCallId", "id") || `${toolName}-${state.messages.length + 1}`;

  if (chunkType === "tool-call" || chunkType === "tool-execution-start") {
    if (state.toolCallIndexesById.has(toolCallId)) return;
    const message: AgentMessage = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName,
          input: toJsonSerializable(toolInputFromPayload(payload))
        }
      ]
    };
    state.toolCallIndexesById.set(toolCallId, state.messages.length);
    state.messages.push(message);
    return;
  }

  if (chunkType !== "tool-result" && chunkType !== "tool-output" && chunkType !== "tool-execution-end") return;
  if (state.toolResultIds.has(toolCallId)) return;
  state.toolResultIds.add(toolCallId);

  if (!state.toolCallIndexesById.has(toolCallId)) {
    state.toolCallIndexesById.set(toolCallId, state.messages.length);
    state.messages.push({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName,
          input: null
        }
      ]
    });
  }

  const output = isFailedToolOutput(toolOutputFromPayload(payload), payload)
    ? { type: "error-json", value: toJsonSerializable(toolOutputFromPayload(payload)) }
    : { type: "json", value: toJsonSerializable(toolOutputFromPayload(payload)) };

  state.messages.push({
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId,
        toolName,
        output
      }
    ]
  });
}

function toJsonSerializable(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return summarizeJsonValue(value, 4000);
  }
}

function submittedOutputFromStreamChunk(chunk: unknown): unknown {
  if (!isObjectRecord(chunk)) return undefined;

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) return submittedOutputFromStreamChunk(nestedAgentChunk);

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (!chunkType.includes("tool")) return undefined;

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const toolName = toolNameFromPayload(payload);
  if (!isFinalSubmitToolName(toolName)) return undefined;

  if (chunkType === "tool-call" || chunkType === "tool-execution-start") {
    return toolInputFromPayload(payload);
  }

  if (chunkType === "tool-result" || chunkType === "tool-output" || chunkType === "tool-execution-end") {
    return unwrapSubmitToolOutput(toolOutputFromPayload(payload));
  }

  return undefined;
}

function submittedOutputDeltaFromStreamChunk(chunk: unknown, state: ToolCallDeltaState): unknown {
  if (!isObjectRecord(chunk)) return undefined;

  const nestedAgentChunk = nestedAgentExecutionChunk(chunk);
  if (nestedAgentChunk) return submittedOutputDeltaFromStreamChunk(nestedAgentChunk, state);

  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (chunkType !== "tool-call-streaming-start" && chunkType !== "tool-call-delta") return undefined;

  const payload = isObjectRecord(chunk.payload) ? chunk.payload : chunk;
  const { toolCallId, toolName } = streamedToolIdentity(payload, state);
  if (!isFinalSubmitToolName(toolName)) return undefined;

  if (chunkType === "tool-call-streaming-start") {
    state.argsById.set(toolCallId, "");
    state.submittedOutputById.delete(toolCallId);
    return undefined;
  }

  const argsTextDelta = stringFromPayload(payload, "argsTextDelta", "delta", "text");
  if (!argsTextDelta) return undefined;

  const argsText = `${state.argsById.get(toolCallId) ?? ""}${argsTextDelta}`;
  state.argsById.set(toolCallId, argsText);

  const submittedOutput = partialSubmitToolOutputFromArgsText(toolName, argsText);
  if (submittedOutput === undefined) return undefined;

  const submittedOutputKey = JSON.stringify(submittedOutput);
  if (state.submittedOutputById.get(toolCallId) === submittedOutputKey) return undefined;

  state.submittedOutputById.set(toolCallId, submittedOutputKey);
  return submittedOutput;
}

function partialSubmitToolOutputFromArgsText(toolName: string, argsText: string) {
  const parsed = parseMaybeJson(argsText);
  if (isObjectRecord(parsed)) return parsed;

  if (toolName === SUBMIT_TREE_OPTIONS_TOOL_NAME) return partialOptionsSubmitOutputFromArgsText(argsText);
  if (toolName === SUBMIT_TREE_NEXT_STEP_TOOL_NAME) return partialNextStepSubmitOutputFromArgsText(argsText);
  if (toolName === SUBMIT_TREE_ARTIFACT_TOOL_NAME) return partialArtifactSubmitOutputFromArgsText(argsText);
  return undefined;
}

function partialNextStepSubmitOutputFromArgsText(argsText: string) {
  const output: Record<string, unknown> = partialOptionsSubmitOutputFromArgsText(argsText) ?? {};
  const action = extractVisibleJsonStringField(argsText, "action");
  if (action) output.action = action;
  return Object.keys(output).length > 0 ? output : undefined;
}

function partialOptionsSubmitOutputFromArgsText(argsText: string) {
  const output: Record<string, unknown> = {};
  const roundIntent = extractVisibleJsonStringField(argsText, "roundIntent");
  if (roundIntent) output.roundIntent = roundIntent;

  const optionsMatch = /"options"\s*:\s*\[/.exec(argsText);
  if (optionsMatch) {
    const optionsText = argsText.slice(optionsMatch.index + optionsMatch[0].length);
    const fallbackIds = ["a", "b", "c"] as const;
    const options = extractVisibleJsonObjectBlocks(optionsText).flatMap((block, index) => {
      const explicitId = extractVisibleJsonStringField(block, "id");
      const id = explicitId || fallbackIds[index];
      const label = extractVisibleJsonStringField(block, "label");
      if (!id || !label) return [];

      const option: Record<string, unknown> = { id, label };
      const description = extractVisibleJsonStringField(block, "description");
      const impact = extractVisibleJsonStringField(block, "impact");
      const kind = extractVisibleJsonStringField(block, "kind");
      const mode = extractVisibleJsonStringField(block, "mode");
      if (description) option.description = description;
      if (impact) option.impact = impact;
      if (kind) option.kind = normalizeOptionKind(kind, index);
      if (mode) option.mode = mode;
      return [option];
    });
    if (options.length > 0) output.options = options;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function partialArtifactSubmitOutputFromArgsText(argsText: string) {
  const output: Record<string, unknown> = {};
  const roundIntent = extractVisibleJsonStringField(argsText, "roundIntent");
  if (roundIntent) output.roundIntent = roundIntent;

  const artifactMatch = /"artifact"\s*:\s*\{/.exec(argsText);
  if (artifactMatch) {
    const artifactText = argsText.slice(artifactMatch.index);
    const type = extractVisibleJsonStringField(artifactText, "type");
    const payload = extractVisibleJsonObjectField(artifactText, "payload");
    if (type || Object.keys(payload).length > 0) {
      output.artifact = {
        ...(type ? { type } : {}),
        ...(Object.keys(payload).length > 0 ? { payload } : {})
      };
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function extractVisibleJsonObjectField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`).exec(text);
  if (!match) return {};

  const objectStart = match.index + match[0].lastIndexOf("{");
  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  const objectText = objectEnd === -1 ? text.slice(objectStart) : text.slice(objectStart, objectEnd + 1);
  return extractVisibleJsonObjectFields(objectText);
}

function extractVisibleJsonObjectFields(text: string): Record<string, unknown> {
  const objectStart = text.indexOf("{");
  if (objectStart === -1) return {};

  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  if (objectEnd !== -1) {
    const parsed = parseMaybeJson(text.slice(objectStart, objectEnd + 1));
    return isObjectRecord(parsed) ? parsed : {};
  }

  const fields: Record<string, unknown> = {};
  let index = objectStart + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "}") break;
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char !== '"') {
      index += 1;
      continue;
    }

    const key = readVisibleJsonString(text, index + 1);
    const fieldName = parseJsonStringValue(key.rawValue);
    index = skipJsonWhitespace(text, key.nextIndex);
    if (!fieldName || text[index] !== ":") {
      index += 1;
      continue;
    }

    const value = readVisibleJsonValue(text, skipJsonWhitespace(text, index + 1));
    if (value.found) {
      fields[fieldName] = value.value;
    }
    index = value.nextIndex > index ? value.nextIndex : index + 1;
  }

  return fields;
}

function readVisibleJsonValue(
  text: string,
  startIndex: number
): { found: true; nextIndex: number; value: unknown } | { found: false; nextIndex: number } {
  const index = skipJsonWhitespace(text, startIndex);
  const char = text[index];
  if (!char) return { found: false, nextIndex: index };

  if (char === '"') {
    const parsed = readVisibleJsonString(text, index + 1);
    return { found: true, nextIndex: parsed.nextIndex, value: parseJsonStringValue(parsed.rawValue) };
  }

  if (char === "{") {
    const objectEnd = findMatchingJsonObjectEnd(text, index);
    if (objectEnd !== -1) {
      return { found: true, nextIndex: objectEnd + 1, value: parseMaybeJson(text.slice(index, objectEnd + 1)) };
    }
    return { found: true, nextIndex: text.length, value: extractVisibleJsonObjectFields(text.slice(index)) };
  }

  if (char === "[") {
    const arrayEnd = findMatchingJsonArrayEnd(text, index);
    if (arrayEnd !== -1) {
      return { found: true, nextIndex: arrayEnd + 1, value: parseMaybeJson(text.slice(index, arrayEnd + 1)) };
    }
    return { found: true, nextIndex: text.length, value: extractVisibleJsonArrayItems(text, index) };
  }

  const primitive = readVisibleJsonPrimitive(text, index);
  return primitive.found ? primitive : { found: false, nextIndex: primitive.nextIndex };
}

function extractVisibleJsonArrayItems(text: string, startIndex: number) {
  const values: unknown[] = [];
  let index = startIndex + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "]") break;
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    const value = readVisibleJsonValue(text, index);
    if (value.found) values.push(value.value);
    index = value.nextIndex > index ? value.nextIndex : index + 1;
  }

  return values;
}

function readVisibleJsonPrimitive(
  text: string,
  startIndex: number
): { found: true; nextIndex: number; value: unknown } | { found: false; nextIndex: number } {
  let index = startIndex;
  while (index < text.length && !/[,\]}\s]/.test(text[index])) {
    index += 1;
  }

  const rawValue = text.slice(startIndex, index).trim();
  if (!rawValue) return { found: false, nextIndex: index };
  const parsed = parseMaybeJson(rawValue);
  return parsed !== rawValue ? { found: true, nextIndex: index, value: parsed } : { found: false, nextIndex: index };
}

function skipJsonWhitespace(text: string, startIndex: number) {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

function extractVisibleJsonStringField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`).exec(text);
  if (!match) return "";
  const parsed = readVisibleJsonString(text, match.index + match[0].length);
  return parseJsonStringValue(parsed.rawValue);
}

function extractVisibleJsonObjectBlocks(text: string) {
  const blocks: string[] = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const objectStart = text.indexOf("{", searchIndex);
    if (objectStart === -1) break;
    const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) {
      blocks.push(text.slice(objectStart));
      break;
    }

    blocks.push(text.slice(objectStart, objectEnd + 1));
    searchIndex = objectEnd + 1;
  }

  return blocks;
}

function findMatchingJsonObjectEnd(text: string, startIndex: number) {
  return findMatchingJsonStructureEnd(text, startIndex, "{", "}");
}

function findMatchingJsonArrayEnd(text: string, startIndex: number) {
  return findMatchingJsonStructureEnd(text, startIndex, "[", "]");
}

function findMatchingJsonStructureEnd(text: string, startIndex: number, open: string, close: string) {
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function readVisibleJsonString(text: string, startIndex: number) {
  let rawValue = "";
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      rawValue += `\\${char}`;
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      return { rawValue, nextIndex: index + 1 };
    }

    rawValue += char;
  }

  if (isEscaped) rawValue += "\\";
  return { rawValue, nextIndex: text.length };
}

function parseJsonStringValue(rawValue: string) {
  try {
    return JSON.parse(`"${rawValue}"`) as string;
  } catch {
    for (let end = rawValue.length - 1; end >= 0; end -= 1) {
      try {
        return JSON.parse(`"${rawValue.slice(0, end)}"`) as string;
      } catch {
        // Keep trimming until the visible JSON string prefix ends before an incomplete escape.
      }
    }

    return "";
  }
}

function unwrapSubmitToolOutput(output: unknown) {
  const parsed = parseMaybeJson(output);
  if (isObjectRecord(parsed) && isObjectRecord(parsed.output)) return parsed.output;
  if (isObjectRecord(parsed) && isObjectRecord(parsed.result)) return parsed.result;
  return parsed;
}

function isFinalSubmitToolName(toolName: string) {
  return (
    toolName === SUBMIT_TREE_ARTIFACT_TOOL_NAME ||
    toolName === SUBMIT_TREE_NEXT_STEP_TOOL_NAME ||
    toolName === SUBMIT_TREE_OPTIONS_TOOL_NAME
  );
}

function streamChunkTypeForLog(chunk: unknown) {
  if (isRecord(chunk) && typeof chunk.type === "string") return chunk.type;
  return typeof chunk;
}

function streamChunkKeysForLog(chunk: unknown) {
  if (!isRecord(chunk)) return [];
  return Object.keys(chunk).slice(0, 12);
}

function summarizePartialObjectForLog(value: unknown) {
  if (value === undefined) return null;
  if (!isObjectRecord(value)) return typeof value;

  const options = Array.isArray(value.options) ? value.options : [];
  const artifact = isObjectRecord(value.artifact) ? value.artifact : null;
  return {
    keys: Object.keys(value),
    roundIntent: typeof value.roundIntent === "string" ? value.roundIntent : "",
    optionCount: options.length,
    optionLabels: options.flatMap((option) =>
      isObjectRecord(option) && typeof option.label === "string" ? [option.label] : []
    ),
    artifactFields: artifact ? Object.keys(artifact) : [],
    artifactPayloadFields: artifact && isObjectRecord(artifact.payload) ? Object.keys(artifact.payload) : []
  };
}

function summarizeErrorForLog(error: unknown) {
  if (isStructuredOutputValidationError(error)) return structuredOutputIssueSummary(error);
  if (error instanceof Error) return error.message;
  return String(error);
}

function nestedAgentExecutionChunk(chunk: Record<string, unknown>) {
  const chunkType = typeof chunk.type === "string" ? chunk.type : "";
  if (!chunkType.startsWith("agent-execution-event-")) return null;
  return isObjectRecord(chunk.payload) ? chunk.payload : null;
}

function toolNameFromPayload(payload: Record<string, unknown>) {
  const directName = stringFromPayload(payload, "toolName", "name", "primitiveId", "task");
  if (directName) return directName;

  const args = recordFromPayload(payload, "args");
  return args ? stringFromPayload(args, "toolName", "name") : "";
}

function streamedToolIdentity(payload: Record<string, unknown>, state: ToolCallDeltaState) {
  let toolName = toolNameFromPayload(payload);
  const toolCallId = stringFromPayload(payload, "toolCallId", "id") || toolName;
  if (toolCallId && toolName) {
    state.toolNamesById.set(toolCallId, toolName);
  } else if (toolCallId) {
    toolName = state.toolNamesById.get(toolCallId) ?? "";
  }

  return { toolCallId, toolName };
}

function toolInputFromPayload(payload: Record<string, unknown>) {
  const args = valueFromPayload(payload, "args", "input", "toolInput");
  if (!isObjectRecord(args)) return args;
  if (isObjectRecord(args.args)) return args.args;
  return args;
}

function toolOutputFromPayload(payload: Record<string, unknown>) {
  return valueFromPayload(payload, "result", "output", "toolOutput");
}

function recordFromPayload(payload: Record<string, unknown>, ...keys: string[]) {
  const value = valueFromPayload(payload, ...keys);
  return isObjectRecord(value) ? value : null;
}

function stringFromPayload(payload: Record<string, unknown>, ...keys: string[]) {
  const value = valueFromPayload(payload, ...keys);
  return typeof value === "string" ? value : "";
}

function valueFromPayload(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in payload) return payload[key];
  }
  return undefined;
}

function isFailedToolOutput(output: unknown, payload?: Record<string, unknown>) {
  const parsedOutput = parseMaybeJson(output);
  if (isObjectRecord(payload) && payload.isError === true) return true;
  if (!isObjectRecord(parsedOutput)) return false;
  if (parsedOutput.ok === false) return true;
  return typeof parsedOutput.exitCode === "number" && parsedOutput.exitCode !== 0;
}

function summarizeJsonValue(value: unknown, maxLength: number) {
  if (value === undefined) return "";
  if (typeof value === "string") return truncateText(value.trim(), maxLength);
  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

function truncateText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function structuredObjectFromStreamChunk(chunk: unknown) {
  if (!isRecord(chunk)) return undefined;
  if (chunk.type !== "object" && chunk.type !== "object-result" && chunk.type !== "network-object-result") {
    return undefined;
  }

  if ("object" in chunk) return chunk.object;
  if (isRecord(chunk.payload) && "object" in chunk.payload) return chunk.payload.object;
  return undefined;
}

function logMastraPrompt(
  kind: RuntimeSubmitTarget,
  context: SharedAgentContextInput,
  messages: MastraConversationMessage[]
) {
  const instructions =
    kind === "turn"
      ? buildTreeTurnInstructions(context)
      : kind === "artifact"
      ? buildTreeArtifactInstructions(context)
      : kind === "next-step"
        ? buildTreeNextStepInstructions(context)
        : buildTreeOptionsInstructions(context);
  console.info(
    `[treeable:mastra-prompt:${kind}]`,
    JSON.stringify(
      {
        instructions,
        messages
      },
      null,
      2
    )
  );
}

async function resolveStructuredStreamOutput(stream: StructuredObjectStreamResult, latestPartial: unknown) {
  if (stream.object !== undefined) {
    try {
      const output = stream.object instanceof Promise ? await stream.object : stream.object;
      return unwrapMastraToolInputOrFallback(output, latestPartial);
    } catch (error) {
      return recoverMastraStructuredOutputValidationValue(error, latestPartial);
    }
  }

  if (stream.output !== undefined) {
    try {
      const output = stream.output instanceof Promise ? await stream.output : stream.output;
      return unwrapMastraToolInputOrFallback(output, latestPartial);
    } catch (error) {
      return recoverMastraStructuredOutputValidationValue(error, latestPartial);
    }
  }

  return unwrapMastraToolInput(latestPartial);
}

function recoverMastraStructuredOutputValidationValue(error: unknown, fallback?: unknown) {
  const value = findMastraStructuredOutputValidationValue(error);
  if (value === undefined) {
    throw error;
  }

  const recovered = unwrapMastraToolInput(parseMaybeJson(value));
  if (isRecord(recovered)) {
    return recovered;
  }

  if (fallback !== undefined && fallback !== null) {
    return unwrapMastraToolInput(fallback);
  }

  throw error;
}

function unwrapMastraToolInputOrFallback(value: unknown, fallback: unknown) {
  const unwrapped = unwrapMastraToolInput(value);
  if ((unwrapped === undefined || unwrapped === null) && fallback !== undefined && fallback !== null) {
    return unwrapMastraToolInput(fallback);
  }

  return unwrapped;
}

function findMastraStructuredOutputValidationValue(error: unknown): unknown {
  if (!isRecord(error)) {
    return undefined;
  }

  if (
    error.id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED" &&
    isRecord(error.details) &&
    "value" in error.details
  ) {
    return error.details.value;
  }

  return findMastraStructuredOutputValidationValue((error as { cause?: unknown }).cause);
}

function unwrapMastraToolInput(value: unknown) {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !("input" in parsed)) {
    return parsed;
  }

  return parseMaybeJson(parsed.input);
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function* toAsyncIterable<T>(source: StreamSource<T>): AsyncIterable<T> {
  const resolved = typeof source === "function" ? source() : source;

  if (isAsyncIterable<T>(resolved)) {
    yield* resolved;
    return;
  }

  const readable = resolved as ReadableStream<T>;
  if (typeof (readable as { getReader?: unknown }).getReader !== "function") {
    throw new Error("Mastra structured stream did not expose an async iterable or readable object stream.");
  }

  const reader = readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof (value as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
