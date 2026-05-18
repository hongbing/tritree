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
    title: "搜索资料",
    description: "围绕给定主题快速寻找可用素材、来源线索和事实支点。",
    expectedOutput: "资料清单：每条包含来源、要点、可用角度、可信度提示，以及建议如何转交给主 agent 使用。",
    prompt: "你是搜索资料子代理。聚焦任务主题，寻找可核查、可引用、可转化为内容素材的信息线索。输出材料清单和使用建议，把是否继续生成、改写或收束留给主 agent 判断。"
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
