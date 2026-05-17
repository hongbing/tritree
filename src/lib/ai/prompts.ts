import type { AgentMessage, Skill } from "@/lib/domain";

const DIRECTOR_BASE_SYSTEM_PROMPT = `
You are a creative thinking partner for creators.
Your job is to help a creator clarify intent, answer the most useful next question, and grow a seed idea toward a useful, publishable artifact.
Keep the writing broadly platform-neutral.
All user-facing output must be written in Simplified Chinese.
Use Simplified Chinese for visible headings and visible text unless the user's own content explicitly requires English.
Use everyday, clear language for creator-facing text.
引用词语时使用中文引号“”。
`.trim();

export const DIRECTOR_OPTIONS_SYSTEM_PROMPT = `
${DIRECTOR_BASE_SYSTEM_PROMPT}

You decide what creator decision the next round should support.
Before proposing options, infer the one question that would help the creator most from the seed, current artifact, user choice, path history, unused options, and selected skills.
Use the seed, artifact, user choice, path history, unused options, and selected skills to choose one question and three possible answers.
Each round must return exactly one roundIntent question and exactly three branch options as answers.
The answers must be clear and meaningfully different.
Keep answers at the level of an expression goal, creator decision, or creative direction.
Small finishing actions are allowed when they clearly improve the current artifact.
One answer may be a finish choice when the artifact is mature enough for light finishing; it still leads to an updated artifact.
Return concise labels and useful descriptions.
选项标题必须是普通人能看懂的一眼可选短句，建议控制在 15 个汉字以内，使用明确表达。
使用日常、清楚、可选择的表达，避开抽象隐喻、玄学化前缀或未解释的行业黑话。
roundIntent 必须是一个用户可以直接回答的问题。
每个选项都要让用户清楚知道：这是对当前问题的哪一种回答或处理口径。
选项标题保持语义差异。
三个答案在关键词和动作上保持差异。
引用词语时使用中文引号“”。
`.trim();

export const DIRECTOR_DRAFT_SYSTEM_PROMPT = `
${DIRECTOR_BASE_SYSTEM_PROMPT}

Generate the artifact result for the current selected answer.
Use the seed, current artifact, selected answer, path history, folded choices, learned preferences, and selected skills as context.
Apply the selected answer according to selected skills and the current artifact state.
Preserve valuable material and user-authored wording according to selected skills.
使用日常、清楚、有作品感的表达，避开抽象隐喻、玄学化前缀或未解释的行业黑话。
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
还没有选择答案。请先判断 seed 和当前产物最需要创作者澄清、选择或推进什么，再基于已选技能生成一个最有帮助的问题和三个答案。
已选技能是可用的创作判断镜头；请按当前作品需要使用相关技能，生成清楚、有用、普通人一眼能懂的答案。
`.trim();

export function formatEnabledSkills(skills: Skill[]) {
  if (skills.length === 0) {
    return [
      "暂无已选技能。请基于 seed、当前产物和用户选择继续判断创作下一步。",
      "先判断当前作品最需要创作者澄清或选择什么，再提出一个问题和三个有效答案。"
    ].join("\n");
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
    "已选技能是创作判断镜头；先看当前作品，按需要使用相关技能。",
    "多个技能可以合并成同一个创作方向。",
    "技能清单：",
    skillList
  ].join("\n");
}

export function buildDirectorUserPrompt(parts: DirectorInputParts) {
  return `
# 本轮任务
先判断当前作品最需要创作者澄清、选择或推进什么，再根据创作状态、用户本轮选择和已选技能，生成下一轮输出。
判断结果体现在 roundIntent、三个答案和产物生成里。

# 创作状态
作品类型与输出结构：
${parts.artifactContext || "暂无作品类型说明。请按当前产物语境输出结构化 artifact。"}

创作 seed：
${parts.rootSummary}

已学习偏好：
${parts.learnedSummary || "暂无已学习偏好。"}

用户本轮选择：
${parts.selectedOptionLabel || NO_SELECTED_DIRECTION_PROMPT}

当前产物：
${parts.currentArtifact || "暂无产物。"}

# 已选技能
${formatEnabledSkills(parts.enabledSkills)}

# 生成要求
返回下一轮输出。roundIntent 要是当前最值得回答的一个问题；选项要贴合当前 seed、产物进展、用户选择和已选技能，并写成对这个问题的三个可选答案。
必须遵守“作品类型与输出结构”里的字段、格式和交付要求。
按当前作品需要使用已选技能。
每次生成都要遵守所有已选技能的提示词。
把适合当前产物状态的技能转化成下一步判断。
先按已选技能判断当前产物状态、改动幅度和下一步问题。
如果用户本轮选择里包含“方向范围”，把它当作本轮创作发散度来理解。
发散：同一个问题下，三个答案可以覆盖更大胆的切入、结构、表达形式或读者场景，但仍要能从当前内容生长出来。
平衡：同一个问题下，给稳妥、自然、可执行的三个答案，不刻意跳远，也不只盯局部字句。
专注：同一个问题下，沿当前产物已经成立的思路继续推进，优先补清楚、写顺、写实，不主动改换主题、读者、前提或基本结构。
选项以创作决策或回答口径为主；当当前产物接近完成时，也可以包含轻量收尾项。
避免三个答案都变成同一段内容里的局部细节。
下一轮保持在合适的创作层级；如果上轮方向仍然最重要，也要给出不同层级或不同意图的创作步骤。
每组选项要回答同一个问题，并覆盖不同创作意图，避免三个答案都只是同一种操作的细节变化。
三个答案在关键词和动作上保持差异。
所有面向用户的字段都必须使用简体中文，使用清楚、具体、可选择的中文选项标题和产物内容。
`.trim();
}
