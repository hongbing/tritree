import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { SkillUpsert } from "@/lib/domain";
import { createTreeableAnthropicModel } from "@/lib/ai/mastra-agents";
import {
  StyleProfileGenerationError,
  buildStyleProfileUserPrompt,
  normalizeGeneratedStyleDraft
} from "@/lib/skills/style-profile";

const StyleProfileOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  prompt: z.string()
});

type StyleProfileAgentLike = {
  generate: (
    messages: Array<{ role: "user"; content: string }>,
    options: {
      abortSignal?: AbortSignal;
      structuredOutput: { jsonPromptInjection: boolean; schema: typeof StyleProfileOutputSchema };
    }
  ) => Promise<{ object?: unknown; output?: unknown }>;
};

export async function generateStyleFromSamples({
  env,
  samples,
  signal,
  styleAgent
}: {
  env?: Record<string, string | undefined>;
  samples: string[];
  signal?: AbortSignal;
  styleAgent?: StyleProfileAgentLike;
}): Promise<SkillUpsert> {
  const normalizedSamples = samples.map((sample) => sample.trim()).filter(Boolean);
  if (normalizedSamples.length === 0) {
    throw new StyleProfileGenerationError("请先粘贴至少一段代表作。", 400);
  }

  try {
    const agent =
      styleAgent ??
      (new Agent({
        id: "tritree-style-profile-agent",
        name: "Tritree Style Profile Agent",
        instructions: STYLE_PROFILE_SYSTEM_PROMPT,
        model: createTreeableAnthropicModel(env)
      }) as unknown as StyleProfileAgentLike);

    const result = await agent.generate(
      [{ role: "user", content: buildStyleProfileUserPrompt(normalizedSamples) }],
      {
        abortSignal: signal,
        structuredOutput: {
          jsonPromptInjection: true,
          schema: StyleProfileOutputSchema
        }
      }
    );

    return normalizeGeneratedStyleDraft(result.object ?? result.output);
  } catch (error) {
    if (error instanceof StyleProfileGenerationError || isAbortError(error)) {
      throw error;
    }

    throw new StyleProfileGenerationError("无法生成我的风格。", 500);
  }
}

function isAbortError(error: unknown) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

const STYLE_PROFILE_SYSTEM_PROMPT = `
你是 Tritree 的个人写作风格归纳器，负责归纳用户写作风格。
你的任务是从用户提供的代表作中归纳稳定、可复用、可执行的写作风格，并输出一个可以保存为 Skill 的草稿。
所有可见字段使用简体中文。
不要复制样本文本中的长句。
不要把样本主题、公司、人物或事件当成用户永久偏好。
prompt 要写成明确的写作指令，帮助后续草稿生成保持作者表达习惯。
`.trim();
