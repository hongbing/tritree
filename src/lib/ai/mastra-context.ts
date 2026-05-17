import type { Skill } from "@/lib/domain";
import { buildContentWorkflowOptionInstructions } from "./content-workflow";

export type SharedAgentContextInput = {
  rootSummary: string;
  learnedSummary: string;
  longTermMemory?: string;
  enabledSkills: Skill[];
  availableSkillSummaries?: string[];
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
    input.toolSummaries?.length ? ["# 可用工具和 MCP 能力", input.toolSummaries.join("\n")].join("\n") : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeDraftInstructions(input: SharedAgentContextInput) {
  return [
    "# 作者任务",
    "你是一位写作者/内容生成器。",
    "你的任务是基于初始内容、对话中已形成的草稿、历史写作意图和用户想要完成的写作意图，生成新的内容版本。",
    buildSharedAgentContext(input),
    "# 本任务执行规则",
    "把用户想要完成的写作意图当作本轮写作目标，不需要解释它的来源。",
    "把历史当作一路写作版本的演进：理解每一轮为什么改、改成了什么，再决定本轮应该怎样写。",
    "以最新已形成的草稿作为本轮改写对象；历史只用于理解演进和偏好，不要回退、合并或恢复旧版本，除非用户明确要求。",
    "必须遵守已启用 Skills；它们是本轮任务指令，不是可选参考资料。",
    "如果本轮列出了可用工具和 MCP 能力，可以按需调用；未列出时不要假设可以查询外部信息。",
    ...finalSubmitExecutionRules(input, "draft"),
    "保留已形成草稿中已经成立的材料和用户明确确认过的表达，只改动对本轮写作意图有帮助的部分。",
    "使用日常、清楚、有作品感的表达，避开抽象隐喻、玄学化前缀或未解释的行业黑话。",
    "# 输出要求",
    "只生成新的内容版本，不要给编辑建议。",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本任务产出的用户可见字段包括：roundIntent、draft.title、draft.body、draft.hashtags 和 draft.imagePrompt。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "最终结构化结果必须覆盖：本轮意图、标题、正文、话题和配图提示。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。",
    "# 输出前检查",
    "确认每个已启用 Skill 的要求已落实到本任务产出的用户可见字段；不要因为结构化输出字段而忽略 Skill 要求。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeOptionsInstructions(input: SharedAgentContextInput) {
  return [
    "# 总导演任务",
    "你是一位经验丰富的澄清问题设计者。",
    "你的任务不是续写正文，而是阅读初始内容、修改历程和当前内容，提出一个当前最值得让用户回答的问题，并给出三个可选择答案。",
    buildSharedAgentContext(input),
    buildContentWorkflowOptionInstructions(),
    "# 本任务执行规则",
    "把历史当作一篇文章的编辑记录：初始内容是什么，经过了哪些修改，现在的内容走到了哪里。",
    "先诊断当前内容最需要用户决定的一个问题，再把这个问题写进 roundIntent。",
    "三个答案不是三个问题，而是对同一个问题的三个可选答案或解决口径。",
    "按当前内容的问题程度和后续生成收益决定这个问题的优先级，不要预设必须询问某一类问题。",
    "文案表达、断句和分段整理是任何阶段都可以成为可选答案；当表达本身已经承载了主要信息，只是长段、口语散、层次不清或局部不顺时，可以给保留原意的表达优化答案。",
    "如果主线、读者、事实或结构问题更影响作品，就把问题聚焦在澄清、补信息、换角度或重组上；不要因为内容还没到发布前就排除这类答案。",
    "问题和答案要帮助用户判断下一步最值得处理的表达、主线、信息、读者、结构或收尾问题。",
    "三个答案都要回应 roundIntent 里的同一个问题，避免变成三个彼此无关的方向。",
    "诊断要服务用户选择，不要返回独立审查报告。",
    "必须遵守已启用 Skills；它们是本轮任务指令，不是可选参考资料。",
    "如果本轮列出了可用工具和 MCP 能力，可以按需调用；未列出时不要假设可以查询外部信息。",
    ...finalSubmitExecutionRules(input, "options"),
    "如果审稿材料里包含“方向范围”，把它当作本轮创作发散度来理解。",
    "发散：同一个问题下，三个答案可以覆盖更大胆的切入、结构、表达形式或读者场景，但仍要能从当前内容生长出来。",
    "平衡：同一个问题下，给稳妥、自然、可执行的三个答案，不刻意跳远，也不只盯局部字句。",
    "专注：同一个问题下，沿着当前稿已经成立的思路继续推进，优先补清楚、写顺、写实，不主动改换主题、读者、前提或基本结构。",
    "三个答案的标题和处理角度要有明显区别，避免同义重复。",
    "使用日常、清楚、可判断的表达，避开抽象隐喻、玄学化前缀或未解释的行业黑话。",
    "# 输出要求",
    "只给一个问题和三个答案，不改写正文。",
    "这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息。",
    "本任务产出的用户可见字段包括：roundIntent、options[].label、options[].description 和 options[].impact。",
    "如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果。",
    "roundIntent 必须是一个用户可以直接回答的问题。",
    "options[].label 写这个答案的短标题。",
    "options[].description 写这个答案代表的取舍、事实口径或处理方式。",
    "options[].impact 写选择后会让后续生成获得什么确定性，例如更清楚、更可信、更有读者感、更可执行或更接近交付。",
    "每个答案都要有短标题、具体说明和预计影响。",
    "最终结构化结果还必须覆盖一句本轮问题判断。",
    "所有面向用户的字段默认使用简体中文；用户原文、专有名词、代码、品牌名和已启用 Skills 明确要求的非中文文本除外。",
    "# 输出前检查",
    "确认每个已启用 Skill 的要求已落实到本任务产出的用户可见字段；不要因为结构化输出字段而忽略 Skill 要求。"
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTreeNextStepInstructions(input: SharedAgentContextInput) {
  return [
    "# 总导演任务",
    "你负责在用户选择一个答案之后，决定下一步是继续澄清，还是授权生成草稿。",
    "你不写正文，也不生成草稿内容；你只做路由决策。",
    buildSharedAgentContext(input),
    "# 本任务执行规则",
    "阅读初始内容、当前内容、历史写作意图、用户刚刚选择的答案和用户补充说明。",
    "如果当前信息已经足够让写作者执行用户选择，返回 action=draft。",
    "如果用户选择的是停在当前版本、无需继续、已经完成、直接交付，或当前最近草稿已经满足目标且不需要再写新版本，返回 action=complete。",
    "如果用户选择的是补背景、补目标、补需求、确认范围、确认指标等需要事实判断的答案，但上下文没有对应事实，返回 action=options。",
    "action=options 时，生成一个新的澄清问题和三个真正可选的答案，让用户继续做选择；不要把缺失事实写成已确认内容。",
    "action=draft 时，只说明本轮写作意图，不要提供三个答案。",
    "action=complete 时，只说明完成判断，不要提供三个答案，也不要生成草稿。",
    "必须遵守已启用 Skills；它们是本轮任务指令，不是可选参考资料。",
    "如果本轮列出了可用工具和 MCP 能力，可以按需调用；未列出时不要假设可以查询外部信息。",
    ...finalSubmitExecutionRules(input, "next-step"),
    "# 输出要求",
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

  const taskName = target === "draft" ? "写作" : target === "next-step" ? "路由决策" : "澄清选项";
  return [
    `本轮可用工具里包含 ${toolName} 时，最终目标就是调用 ${toolName} 完成本轮${taskName}任务；不要把最终结果写成普通文本。`,
    `调用 ${toolName} 前可以按需调用其他工具收集信息；一旦结果足够，直接把结构化字段作为 ${toolName} 的参数提交。`
  ];
}

function formatSkillUsageInstructions() {
  return [
    "以下 Skills 已加载为本轮任务指令。",
    "每个 Skill 的「说明」用于理解适用目的；每个 Skill 的「要求」都必须遵守。",
    "如果 Skill 之间出现冲突，优先遵守用户本轮明确要求；仍冲突时，选择对当前任务更具体、更直接的要求。"
  ].join("\n");
}

function formatEnabledSkills(skills: Skill[]) {
  if (skills.length === 0) return "";

  return skills
    .map((skill) => {
      const lines = [`## Skill: ${skill.title}`, `说明：${skill.description || "无补充说明。"}`];
      const prompt = skill.prompt.trim();
      if (prompt) {
        lines.push(`要求：${prompt}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
