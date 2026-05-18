import type { AgentMessage, Skill } from "@/lib/domain";

const DIRECTOR_BASE_SYSTEM_PROMPT = `
You are a generic ReAct agent running inside a structured product runtime.
Follow active skills, inspect tool results, and complete the requested target through the available final-submit tool.
The system prompt defines execution boundaries and output contracts only; domain strategy comes from active skills and user-provided context.
User-facing fields default to Simplified Chinese unless the user content or an active skill requires otherwise.
`.trim();

export const DIRECTOR_OPTIONS_SYSTEM_PROMPT = `
${DIRECTOR_BASE_SYSTEM_PROMPT}

Target: produce one roundIntent and exactly three options through the options output contract.
Use active skills to decide what those options should mean for the current task.
`.trim();

export const DIRECTOR_ARTIFACT_SYSTEM_PROMPT = `
${DIRECTOR_BASE_SYSTEM_PROMPT}

Target: produce one artifact result through the artifact output contract.
Use active skills to decide how the input should be transformed.
`.trim();

export type DirectorMessage = AgentMessage;

export type DirectorInputParts = {
  artifactContext: string;
  currentArtifact: string;
  enabledSkills: Skill[];
  foldedSummary: string;
  learnedSummary: string;
  messages: DirectorMessage[];
  pathSummary: string;
  rootSummary: string;
  selectedOptionLabel: string;
};

const NO_SELECTED_DIRECTION_PROMPT = `
本轮没有用户已选答案。
`.trim();

export function formatEnabledSkills(skills: Skill[]) {
  if (skills.length === 0) {
    return "暂无已选 Skills。";
  }

  const skillList = skills
    .map((skill, index) =>
      [
        `技能 ${index + 1}：${skill.title}`,
        `说明：${skill.description}`,
        `提示词：\n${skill.prompt}`
      ].join("\n")
    )
    .join("\n\n");

  return [
    "以下 Skills 是本轮 active instructions；根据本轮目标和上下文应用。",
    "Skill 清单：",
    skillList
  ].join("\n");
}

export function buildDirectorUserPrompt(parts: DirectorInputParts) {
  return `
# Runtime Input
本消息只提供上下文数据，不定义业务策略。请按系统提示词、已启用 Skills、可用工具和本轮目标输出契约完成任务。

# Artifact Context
${parts.artifactContext || "未指定。"}

# Initial Input
${parts.rootSummary}

# Learned Preferences
${parts.learnedSummary || "暂无已学习偏好。"}

# User Selection Or Request
${parts.selectedOptionLabel || NO_SELECTED_DIRECTION_PROMPT}

# Current Visible Result
${parts.currentArtifact || "暂无。"}

# Active Skills
${formatEnabledSkills(parts.enabledSkills)}
`.trim();
}
