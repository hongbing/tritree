import type { Skill } from "@/lib/domain";

export type SharedAgentContextInput = {
  rootSummary: string;
  learnedSummary: string;
  longTermMemory?: string;
  enabledSkills: Skill[];
  availableSkillSummaries?: string[];
  subagentTemplateSummaries?: string[];
  toolSummaries?: string[];
};

const SUBMIT_TREE_DRAFT_TOOL_NAME = "submit_tree_draft";
const SUBMIT_TREE_NEXT_STEP_TOOL_NAME = "submit_tree_next_step";
const SUBMIT_TREE_OPTIONS_TOOL_NAME = "submit_tree_options";

export function buildSharedAgentContext(input: SharedAgentContextInput) {
  return [
    "# 已启用 Skills",
    formatSkillUsageInstructions(),
    input.enabledSkills.length > 0 ? formatEnabledSkills(input.enabledSkills) : "暂无已启用 Skills。",
    input.availableSkillSummaries?.length
      ? ["# 可加载 Skill 摘要", input.availableSkillSummaries.join("\n")].join("\n")
      : "",
    input.subagentTemplateSummaries?.length
      ? ["# 可用 Subagent 模板", input.subagentTemplateSummaries.join("\n")].join("\n")
      : "",
    input.toolSummaries?.length ? ["# 可用工具和 MCP 能力", input.toolSummaries.join("\n")].join("\n") : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeDraftInstructions(input: SharedAgentContextInput) {
  return [
    "# ReAct Agent",
    formatGenericReactAgentRole(),
    buildSharedAgentContext(input),
    actualWorkExecutionProtocol(),
    "# 本轮固定目标",
    "本轮固定目标：提交 draft 结果。",
    "根据输入上下文、已启用 Skills 和可用工具完成目标；具体领域判断由 Skills 提供。",
    ...finalSubmitExecutionRules(input, "draft"),
    "# 输出契约",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本轮用户可见字段包括：roundIntent、draft.title、draft.body、draft.hashtags、draft.imagePrompt。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "最终结构化结果必须包含完整 draft 对象。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。",
    "# 提交前检查",
    "确认每个已启用 Skill 的要求已落实到本任务产出的用户可见字段；不要因为结构化输出字段而忽略 Skill 要求。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeOptionsInstructions(input: SharedAgentContextInput) {
  return [
    "# ReAct Agent",
    formatGenericReactAgentRole(),
    buildSharedAgentContext(input),
    actualWorkExecutionProtocol(),
    threeChoiceProtocol(),
    "# 本轮固定目标",
    "本轮固定目标：提交 options 结果。",
    "根据输入上下文、已启用 Skills 和可用工具完成目标；具体领域判断由 Skills 提供。",
    ...finalSubmitExecutionRules(input, "options"),
    "# 输出契约",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本轮用户可见字段包括：roundIntent、options[].label、options[].description 和 options[].impact。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "最终结构化结果必须包含一个 roundIntent 和正好三个 options。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。",
    "# 提交前检查",
    "确认每个已启用 Skill 的要求已落实到本任务产出的用户可见字段；不要因为结构化输出字段而忽略 Skill 要求。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeNextStepInstructions(input: SharedAgentContextInput) {
  return [
    "# ReAct Agent",
    formatGenericReactAgentRole(),
    buildSharedAgentContext(input),
    actualWorkExecutionProtocol(),
    threeChoiceProtocol(),
    "# 本轮固定目标",
    "本轮固定目标：提交 next-step 路由结果。",
    "根据输入上下文、已启用 Skills 和可用工具决定 action；具体领域判断由 Skills 提供。",
    ...finalSubmitExecutionRules(input, "next-step"),
    "# 输出契约",
    "只返回结构化结果。",
    "action 只能是 options、draft 或 complete。",
    "当 action=options 时，roundIntent 必须是一个新问题，并必须返回 options[].label、options[].description 和 options[].impact；不需要输出 id 或 kind，系统会自动把三个答案映射为 a、b、c。",
    "当 action=draft 时，不返回 options；只返回 roundIntent。",
    "当 action=complete 时，不返回 options；只返回 roundIntent。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatGenericReactAgentRole() {
  return [
    "你是通用 ReAct agent。",
    "系统提示词只定义执行边界、工具协议和最终提交契约；领域策略、内容判断和表达取舍来自输入上下文与已启用 Skills。",
    "先理解本轮目标，再按需思考、调用工具、检查工具返回值，并用最终提交工具交付结果。"
  ].join("\n");
}

function actualWorkExecutionProtocol() {
  return [
    "# ReAct 执行协议",
    "先判断本轮最有价值的实际工作，并优先由主 agent 自己处理；能直接完成判断、整理、改写或提交时，不要调用 subagent。",
    "确实需要独立上下文、并且任务适合委托时，优先使用 run_subagent_template；只有没有匹配的预创建模板，且任务边界很窄、期望输出很明确时，才使用 run_custom_subagent。",
    "subagent 作为工具使用，其返回值不是最终判断。调用任何工具或 subagent 后，必须检查工具返回值是否具体、相关、可信、足以支持本轮目标。",
    "如果工具返回值空泛、偏题、缺少依据或不足以推进，主 agent 要自己补足、改写任务后重试合适工具，或提交需要用户选择的 options。",
    "完成工具结果检查后，由主 agent 把可用信息整合成目标要求的最终结构化结果；不要把“已调用工具或 subagent”当作本轮完成。",
    "调用 subagent 时给出短任务、期望输出和必要约束；运行时会为 subagent 提供当前上下文视图。"
  ].join("\n");
}

function threeChoiceProtocol() {
  return [
    "# 三选一交互协议",
    "三选一是用户交互和显示协议：当本轮需要用户从三个可执行答案中选择时，先形成 decisionRationale，再把需要用户决定的问题写成 roundIntent。",
    "三个 option 都必须回答同一个 roundIntent，不能变成三个彼此无关的新问题。",
    "三个 option 要足够具体，让用户能直接比较选择后的影响。"
  ].join("\n");
}

function finalSubmitExecutionRules(input: SharedAgentContextInput, target: "draft" | "next-step" | "options") {
  const toolName =
    target === "draft"
      ? SUBMIT_TREE_DRAFT_TOOL_NAME
      : target === "next-step"
        ? SUBMIT_TREE_NEXT_STEP_TOOL_NAME
        : SUBMIT_TREE_OPTIONS_TOOL_NAME;
  const hasFinalSubmitTool = input.toolSummaries?.some(
    (summary) => summary.includes(`${toolName}：`) || summary.includes(`${toolName}:`)
  );
  if (!hasFinalSubmitTool) return [];

  const taskName = target === "draft" ? "draft" : target === "next-step" ? "next-step" : "options";
  return [
    `本轮可用工具里包含 ${toolName} 时，最终目标就是调用 ${toolName} 完成本轮 ${taskName} 任务；不要把最终结果写成普通文本。`,
    `调用 ${toolName} 前可以按需调用其他工具收集信息；一旦结果足够，直接把结构化字段作为 ${toolName} 的参数提交。`
  ];
}

function formatSkillUsageInstructions() {
  return [
    "以下 Skills 已加载为 active instructions。",
    "每个 Skill 的说明用于理解适用目的；每个 Skill 的要求都必须遵守。",
    "根据 Skill 的适用目标和本轮任务相关性应用要求。",
    "如果 Skill 之间出现冲突，优先遵守用户本轮明确要求；仍冲突时，选择对当前任务更具体、更直接的要求。"
  ].join("\n");
}

function formatEnabledSkills(skills: Skill[]) {
  if (skills.length === 0) return "";

  return skills
    .map((skill) => {
      const lines = [
        `## Skill: ${skill.title}`,
        `适用目标：${skillScopeLabel(skill.appliesTo)}`,
        `说明：${skill.description || "无补充说明。"}`
      ];
      const prompt = skill.prompt.trim();
      if (prompt) {
        lines.push(`要求：${prompt}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function skillScopeLabel(appliesTo: Skill["appliesTo"]) {
  if (appliesTo === "writer") return "draft";
  if (appliesTo === "editor") return "options/next-step";
  return "全程";
}
