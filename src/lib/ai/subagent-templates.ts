export type SubagentTemplate = {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
  prompt: string;
};

export const DEFAULT_SUBAGENT_TEMPLATES: SubagentTemplate[] = [
  {
    id: "material-search",
    title: "素材搜索",
    description: "围绕给定主题快速寻找可用素材、来源线索和事实支点。",
    expectedOutput: "资料清单：每条包含来源、要点、可用角度和可信度提示。",
    prompt: "你是素材搜索子代理。聚焦任务主题，寻找可核查、可引用、可转化为内容素材的信息线索。避免扩写成正文。"
  },
  {
    id: "material-organizer",
    title: "资料整理",
    description: "把零散资料归类、去重，并整理成便于创作使用的结构。",
    expectedOutput: "整理后的资料框架：主题分组、关键事实、冲突点、可用表达和缺口。",
    prompt: "你是资料整理子代理。将输入资料压缩成清晰结构，标出重复、矛盾、重要细节和仍需确认的问题。"
  },
  {
    id: "independent-review",
    title: "独立审读",
    description: "以独立视角审读内容方案或草稿，指出风险、遗漏和改进方向。",
    expectedOutput: "审读意见：主要问题、具体证据、优先级和可执行修改建议。",
    prompt: "你是独立审读子代理。保持挑剔但建设性的视角，只评价任务范围内的内容质量、逻辑、事实风险和表达效果。"
  },
  {
    id: "title-variants",
    title: "标题变体",
    description: "基于同一内容方向生成多种标题角度，便于筛选测试。",
    expectedOutput: "标题候选列表：每个标题附带角度、适用场景和简短取舍说明。",
    prompt: "你是标题变体子代理。围绕核心卖点和受众动机生成差异化标题，避免空泛夸张，保留可直接使用的选项。"
  },
  {
    id: "platform-rewrite",
    title: "平台改写",
    description: "把同一内容改写为不同平台适配版本，保留核心信息并调整语气结构。",
    expectedOutput: "平台版本：按平台列出改写稿，并说明各版本的语气、结构和取舍。",
    prompt: "你是平台改写子代理。根据目标平台调整标题、开头、节奏、表达密度和行动引导，不改变核心事实。"
  }
];

export function getSubagentTemplate(
  id: string,
  templates: SubagentTemplate[] = DEFAULT_SUBAGENT_TEMPLATES
) {
  return templates.find((template) => template.id === id);
}

export function formatSubagentTemplateSummaries(
  templates: SubagentTemplate[] = DEFAULT_SUBAGENT_TEMPLATES
) {
  return templates
    .map(
      (template) =>
        `${template.id}｜${template.title}：${template.description} 预期输出：${template.expectedOutput}`
    )
    .join("\n");
}
