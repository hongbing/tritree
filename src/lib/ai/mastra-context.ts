import type { Skill } from "@/lib/domain";

const WEEKDAY_NAMES_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatCurrentDateTime(now: Date = new Date()): string {
  const weekday = WEEKDAY_NAMES_ZH[now.getDay()];
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${weekday} ${hours}:${minutes}`;
}

export type SharedAgentContextInput = {
  rootSummary: string;
  learnedSummary: string;
  longTermMemory?: string;
  enabledSkills: Skill[];
  availableSkillSummaries?: string[];
  subagentTemplateSummaries?: string[];
  toolSummaries?: string[];
};

const SUBMIT_TREE_ARTIFACT_TOOL_NAME = "submit_tree_artifact";
const SUBMIT_TREE_NEXT_STEP_TOOL_NAME = "submit_tree_next_step";
const SUBMIT_TREE_OPTIONS_TOOL_NAME = "submit_tree_options";

export function buildSharedAgentContext(input: SharedAgentContextInput) {
  return [
    "# 可用 Skills",
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

export function buildTreeArtifactInstructions(input: SharedAgentContextInput) {
  return [
    "# ReAct Agent",
    formatGenericReactAgentRole(),
    buildSharedAgentContext(input),
    actualWorkExecutionProtocol(input),
    "# 本轮固定目标",
    "本轮固定目标：提交 artifact 结果。",
    "根据输入上下文、已启用 Skills 和可用工具完成目标；具体领域判断由 Skills 提供。",
    ...finalSubmitExecutionRules(input, "artifact"),
    "# 输出契约",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本轮用户可见字段包括：roundIntent、artifact.type、artifact.payload 和 artifact.sourceArtifactIds。",
    "artifact.type 必须是本轮作品类型对应的产物类型；artifact.payload 必须遵守作品类型与输出结构里的字段、格式和交付要求。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "最终结构化结果必须包含完整 artifact 对象。",
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
    actualWorkExecutionProtocol(input),
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
    actualWorkExecutionProtocol(input),
    threeChoiceProtocol(),
    "# 本轮固定目标",
    "本轮固定目标：提交 next-step 路由结果。",
    "根据输入上下文、已启用 Skills 和可用工具决定 action；具体领域判断由 Skills 提供。",
    "# next-step 路由准则",
    "流程和阶段标签用于帮助理解本轮任务所处位置；它们是交互提示，不是单向状态机。用户可以在任意时刻回到任一已启用 Skill 能处理的任务。",
    "先判断本轮任务产出了什么、用户接下来是否需要选择，再选择 action。",
    "action=options 表示需要用户在同一个新问题下选择下一步方向；适合资料、搜索、参考、素材收集、分析、审稿或比较之后，把结果转成可执行取舍。",
    "action=artifact 表示下一步已经明确，可以直接生成或更新作品。",
    "action=complete 表示当前请求已经可以收束，适合用户明确要求结束、发布、交付、停止继续澄清，或当前目标已经没有可行动下一步。",
    "当工具结果会影响用户选择或理解，且本轮可用过程数据展示工具时，先展示整理后的材料摘要，再提交 next-step 结果。",
    ...finalSubmitExecutionRules(input, "next-step"),
    "# 输出契约",
    "只返回结构化结果。",
    "action 只能是 options、artifact 或 complete。",
    "当 action=options 时，roundIntent 必须是一个新问题，并必须返回 options[].label、options[].description 和 options[].impact；不需要输出 id 或 kind，系统会自动把三个答案映射为 a、b、c。",
    "当 action=artifact 时，只返回 action 和 roundIntent；后续 artifact 阶段负责生成作品内容。",
    "当 action=complete 时，不返回 options；只返回 roundIntent，可以返回 artifact=null。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeTurnInstructions(input: SharedAgentContextInput) {
  return [
    "# ReAct Agent",
    formatGenericReactAgentRole(),
    buildSharedAgentContext(input),
    actualWorkExecutionProtocol(input),
    threeChoiceProtocol(),
    "# 本轮固定目标",
    "本轮固定目标：在一次主 agent ReAct 循环中推进当前用户请求，并通过一个最终提交工具结束。",
    "如果本轮已经可以形成或更新作品，调用 submit_tree_artifact 提交 artifact 卡片；如果用户需要先从三个可执行答案中选择，调用 submit_tree_options 提交 3 选 1；如果本轮只需要收束且没有新作品，调用 submit_tree_artifact 并让 artifact=null。",
    "不要先提交路由判断再开启另一个主 agent 循环；工具调用、subagent 调用、thinking、过程材料、options 和 artifact 都属于同一个主 agent turn。",
    ...finalSubmitExecutionRules(input, "turn"),
    "# 输出契约",
    "这里的输出要求指最终提交工具参数里的字段，不是额外自然语言消息。",
    "submit_tree_artifact 的用户可见字段包括：roundIntent、artifact.type、artifact.payload 和 artifact.sourceArtifactIds；artifact 可以是 null。",
    "submit_tree_options 的用户可见字段包括：roundIntent、options[].label、options[].description 和 options[].impact，并必须正好三个 options。",
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

function actualWorkExecutionProtocol(input: SharedAgentContextInput) {
  const hasSubagentTools = input.toolSummaries?.some(
    (summary) => summary.includes("run_subagent_template") || summary.includes("run_custom_subagent")
  );
  const lines = [
    "# ReAct 执行协议",
    "开始实际工作前，先判断本轮应加载哪些 Skill；选择后按被选中 Skill 的职责和标准执行。",
    "当本轮目标明确要求查找、核查、补充证据、找来源或确认外部信息时，优先使用可用工具获取或核验材料；只有输入上下文已经提供足够具体且可追溯的材料时，才直接整理。",
    "先判断本轮最有价值的实际工作，并优先由主 agent 负责推进；能直接完成判断、整理、改写或提交时，直接完成。"
  ];

  if (hasSubagentTools) {
    lines.push(
      "确实需要独立上下文、并且任务适合委托时，优先使用 run_subagent_template；只有没有匹配的预创建模板，且任务边界很窄、期望输出很明确时，才使用 run_custom_subagent。",
      "subagent 作为工具使用，其返回值不是最终判断。调用任何工具或 subagent 后，必须检查工具返回值是否具体、相关、可信、足以支持本轮目标。"
    );
  } else {
    lines.push("调用任何工具后，必须检查工具返回值是否具体、相关、可信、足以支持本轮目标。");
  }

  lines.push(
    "如果工具返回值空泛、偏题、缺少依据或不足以推进，主 agent 要自己补足、改写任务后重试合适工具，或提交需要用户选择的 options。",
    hasSubagentTools
      ? "完成工具结果检查后，由主 agent 把可用信息整合成目标要求的最终结构化结果；不要把“已调用工具或 subagent”当作本轮完成。"
      : "完成工具结果检查后，由主 agent 把可用信息整合成目标要求的最终结构化结果。",
    ...(hasSubagentTools ? ["调用 subagent 时给出短任务、期望输出和必要约束；运行时会为 subagent 提供当前上下文视图。"] : [])
  );

  return lines.join("\n");
}

function threeChoiceProtocol() {
  return [
    "# 三选一交互协议",
    "三选一是用户交互和显示协议：当本轮需要用户从三个可执行答案中选择时，先形成 decisionRationale，再把需要用户决定的问题写成 roundIntent。",
    "三个 option 都必须回答同一个 roundIntent，不能变成三个彼此无关的新问题。",
    "三个 option 要足够具体，让用户能直接比较选择后的影响。",
    "如果同时展示过程材料，过程材料只能支撑同一个 roundIntent 和三个 options；不要把过程材料写成另一组 A/B/C 选项、候选题或选择清单。"
  ].join("\n");
}

function finalSubmitExecutionRules(input: SharedAgentContextInput, target: "artifact" | "next-step" | "options" | "turn") {
  if (target === "turn") {
    const hasArtifactSubmitTool = input.toolSummaries?.some(
      (summary) => summary.includes(`${SUBMIT_TREE_ARTIFACT_TOOL_NAME}：`) || summary.includes(`${SUBMIT_TREE_ARTIFACT_TOOL_NAME}:`)
    );
    const hasOptionsSubmitTool = input.toolSummaries?.some(
      (summary) => summary.includes(`${SUBMIT_TREE_OPTIONS_TOOL_NAME}：`) || summary.includes(`${SUBMIT_TREE_OPTIONS_TOOL_NAME}:`)
    );
    if (!hasArtifactSubmitTool && !hasOptionsSubmitTool) return [];
    return [
      `本轮可用工具里包含 ${SUBMIT_TREE_ARTIFACT_TOOL_NAME} 或 ${SUBMIT_TREE_OPTIONS_TOOL_NAME} 时，最终目标就是调用其中一个工具完成本轮任务；不要把最终结果写成普通文本。`,
      `调用最终提交工具前可以按需调用其他工具收集信息；一旦结果足够，直接把结构化字段作为最终提交工具参数提交。`
    ];
  }

  const toolName =
    target === "artifact"
      ? SUBMIT_TREE_ARTIFACT_TOOL_NAME
      : target === "next-step"
        ? SUBMIT_TREE_NEXT_STEP_TOOL_NAME
        : SUBMIT_TREE_OPTIONS_TOOL_NAME;
  const hasFinalSubmitTool = input.toolSummaries?.some(
    (summary) => summary.includes(`${toolName}：`) || summary.includes(`${toolName}:`)
  );
  if (!hasFinalSubmitTool) return [];

  const taskName = target === "artifact" ? "产物生成" : target === "next-step" ? "路由决策" : "澄清选项";
  return [
    `本轮可用工具里包含 ${toolName} 时，最终目标就是调用 ${toolName} 完成本轮${taskName}任务；不要把最终结果写成普通文本。`,
    `调用 ${toolName} 前可以按需调用其他工具收集信息；一旦结果足够，直接把结构化字段作为 ${toolName} 的参数提交。`
  ];
}

function formatSkillUsageInstructions() {
  return [
    "以下 Skills 是本作品可用能力库，不代表本轮全部同时执行。",
    "主 agent 每轮先判断本轮目标应加载哪个或哪些 Skill：通常选择一个主要角色或步骤 Skill，再按需叠加约束、风格或平台类 Skill。",
    "被本轮选中的 Skill 的要求作为 active instructions；未选中的 Skill 只作为可选能力提示。",
    "如果选中的是按需加载 Skill，先使用 load_skill 加载全文；如果选中的是已安装 Skill 且需要未展开的子文档细节，先使用 load_skill_document 加载对应文档。",
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
        `说明：${skill.description || "无补充说明。"}`,
        `加载状态：${skill.defaultLoaded === false ? "按需加载" : "默认加载"}`,
        skill.parentSkillId ? `父级 Skill：${skill.parentSkillId}` : ""
      ];
      const prompt = skill.prompt.trim();
      if (prompt && skill.defaultLoaded !== false) {
        lines.push(`要求：${prompt}`);
      } else if (skill.defaultLoaded === false) {
        lines.push("要求：未展开。需要使用这个 Skill 的具体规则时，先调用 load_skill。");
      }
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function skillScopeLabel(appliesTo: Skill["appliesTo"]) {
  if (appliesTo === "writer") return "artifact";
  if (appliesTo === "editor") return "options/next-step";
  return "全程";
}
