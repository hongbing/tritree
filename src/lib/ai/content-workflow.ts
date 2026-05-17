export const CONTENT_WORKFLOW_STAGES = [
  "clarify-intent",
  "choose-angle",
  "organize-material",
  "write-rewrite",
  "review-repair",
  "finish-publish"
] as const;

export type ContentWorkflowStage = (typeof CONTENT_WORKFLOW_STAGES)[number];

type StageInstruction = {
  id: ContentWorkflowStage;
  label: string;
  when: string;
  questionFocus: string;
  optionExamples: string[];
};

const STAGE_INSTRUCTIONS: StageInstruction[] = [
  {
    id: "clarify-intent",
    label: "澄清意图",
    when: "seed 缺少读者、目的、想让读者产生的感受或行动，或当前方向还不清楚。",
    questionFocus: "让用户先确认读者、目的、表达类型或期望效果。",
    optionExamples: ["写给新手", "写给同行", "写给朋友"]
  },
  {
    id: "choose-angle",
    label: "选择角度",
    when: "主题已经明确，但还缺少有吸引力的切入点、开头承诺或表达角度。",
    questionFocus: "让用户选择从场景、观点、冲突、反差或读者问题中的哪一类角度切入。",
    optionExamples: ["从真实场景开头", "先亮出观点", "用一个反差切入"]
  },
  {
    id: "organize-material",
    label: "组织材料",
    when: "草稿里有可用素材，但顺序散、主线弱、段落职责不清或旁支太多。",
    questionFocus: "让用户决定材料怎样排序、删减、合并或重组。",
    optionExamples: ["按时间顺序整理", "先问题后方法", "删掉旁支内容"]
  },
  {
    id: "write-rewrite",
    label: "写作或改写",
    when: "意图和结构已经足够明确，下一步应该生成更强的正文版本。",
    questionFocus: "让用户选择下一稿的写作动作、改动幅度或表达方式。",
    optionExamples: ["补一个例子", "压成短句", "换成更锋利的表达"]
  },
  {
    id: "review-repair",
    label: "审稿修补",
    when: "草稿已经存在，但清晰度、可信度、读者进入感、事实风险或标题承诺更值得优先处理。",
    questionFocus: "让用户选择当前最影响作品成立的质量问题。",
    optionExamples: ["补清楚因果", "降低断言风险", "增强读者进入感"]
  },
  {
    id: "finish-publish",
    label: "收口发布",
    when: "草稿已经连贯且接近可发布，继续大改的收益低于收束、压缩、检查和平台化交付。",
    questionFocus: "让用户选择最后的发布前处理方式。",
    optionExamples: ["检查标题承诺", "生成发布版", "做最后压缩"]
  }
];

export function buildContentWorkflowOptionInstructions() {
  return [
    "# 内容工作流阶段",
    "这些阶段是内部判断线索，不要把英文阶段名暴露给用户，也不要让用户手动选择阶段。",
    "每轮先判断当前内容最适合哪个阶段，再为该阶段生成一个 roundIntent 问题。",
    "三个 options 必须是对同一个 roundIntent 的三个答案，不是三个互不相关的问题。",
    "",
    ...STAGE_INSTRUCTIONS.flatMap((stage) => [
      `## ${stage.label}`,
      `适用：${stage.when}`,
      `问题焦点：${stage.questionFocus}`,
      `可选动作示例：${stage.optionExamples.join("、")}`
    ]),
    "",
    "# 阶段选择规则",
    "如果 seed 缺少读者、目的或期望效果，优先澄清意图。",
    "如果主题明确但入口不强，优先选择角度。",
    "如果素材有价值但顺序散乱，优先组织材料。",
    "如果用户刚确认了清楚的写作方向，优先写作或改写。",
    "如果草稿已有雏形但存在清晰度、可信度或读者进入问题，优先审稿修补。",
    "如果草稿已经连贯且接近可发布，优先收口发布。",
    "阶段是判断线索，不是硬性流程；如果用户改变方向或当前文本暴露出缺失信息，可以回到更早阶段。",
    "",
    "# 选项表达规则",
    "只使用现有输出字段表达判断：roundIntent、options[].label、options[].description、options[].impact。",
    "roundIntent 写当前最值得用户回答的一个具体问题。",
    "options[].label 写简短、可点击的动作短句。",
    "description 写选择背后的诊断、取舍或处理口径。",
    "impact 写选择后会让下一稿获得什么确定性。",
    "如果三个选择都显得弱，重新选择更有价值的阶段，而不是硬凑三个低价值答案。"
  ].join("\n");
}
