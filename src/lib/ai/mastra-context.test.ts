import { describe, expect, it } from "vitest";
import {
  buildSharedAgentContext,
  buildTreeDraftInstructions,
  buildTreeNextStepInstructions,
  buildTreeOptionsInstructions,
  type SharedAgentContextInput
} from "./mastra-context";

const input = {
  rootSummary: "Seed：写一段天气文字",
  learnedSummary: "用户喜欢具体、自然的表达。",
  longTermMemory: "用户常写朋友圈短文。",
  enabledSkills: [
    {
      id: "system-researcher",
      title: "资料员",
      category: "content-team",
      description: "负责判断资料缺口，并建议是否委托检索或核查。",
      prompt: "先识别当前内容中最影响可信度的事实缺口；必要时建议委托资料型 subagent 做最小范围核查。",
      appliesTo: "both",
      isSystem: true,
      defaultEnabled: true,
      isArchived: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    },
    {
      id: "style-friend",
      title: "朋友圈语气",
      category: "风格",
      description: "更像自然分享。",
      prompt: "使用自然、轻松、不过度修饰的朋友圈语气。",
      appliesTo: "writer",
      isSystem: false,
      defaultEnabled: false,
      isArchived: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    },
    {
      id: "logic-reviewer",
      title: "结构审读",
      category: "检查",
      description: "判断当前内容的主线和结构风险。",
      prompt: "优先指出最影响下一步方向判断的结构问题。",
      appliesTo: "editor",
      isSystem: false,
      defaultEnabled: false,
      isArchived: false,
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:00.000Z"
    }
  ],
  availableSkillSummaries: ["小红书标题：生成适合小红书的标题。"],
  subagentTemplateSummaries: ["资料核查模板：核查一个具体事实，并返回来源、结论和不确定性。"],
  toolSummaries: ["get_weather：查询指定地点天气。"]
} satisfies SharedAgentContextInput;

describe("buildSharedAgentContext", () => {
  it("loads every enabled skill prompt as active instructions", () => {
    const context = buildSharedAgentContext(input);

    expect(context).toContain("# 已启用 Skills");
    expect(context).toContain("以下 Skills 已加载为本轮任务指令");
    expect(context).toContain("每个 Skill 的「要求」都必须遵守");
    expect(context).toContain("根据 Skill 的作用范围和本轮任务相关性应用");
    expect(context).toContain("如果 Skill 之间出现冲突");
    expect(context).toContain("## Skill: 资料员");
    expect(context).toContain("作用范围：全程");
    expect(context).toContain("说明：负责判断资料缺口，并建议是否委托检索或核查。");
    expect(context).toContain("要求：先识别当前内容中最影响可信度的事实缺口；必要时建议委托资料型 subagent 做最小范围核查。");
    expect(context).toContain("## Skill: 朋友圈语气");
    expect(context).toContain("作用范围：内容更新");
    expect(context).toContain("说明：更像自然分享。");
    expect(context).toContain("要求：使用自然、轻松、不过度修饰的朋友圈语气。");
    expect(context).toContain("## Skill: 结构审读");
    expect(context).toContain("作用范围：方向判断");
    expect(context).toContain("说明：判断当前内容的主线和结构风险。");
    expect(context).toContain("要求：优先指出最影响下一步方向判断的结构问题。");
    expect(context).not.toContain("资料员（content-team）");
    expect(context).not.toContain("朋友圈语气（风格）");
    expect(context).toContain("小红书标题：生成适合小红书的标题。");
    expect(context).toContain("# 可用 Subagent 模板");
    expect(context).toContain("资料核查模板：核查一个具体事实，并返回来源、结论和不确定性。");
    expect(context).toContain("get_weather：查询指定地点天气。");
    expect(context.indexOf("# 可用 Subagent 模板")).toBeGreaterThan(context.indexOf("# 可加载 Skill 摘要"));
    expect(context.indexOf("# 可用 Subagent 模板")).toBeLessThan(context.indexOf("# 可用工具和 MCP 能力"));
    expect(context).not.toContain("Seed：写一段天气文字");
    expect(context).not.toContain("用户喜欢具体、自然的表达。");
    expect(context).not.toContain("用户常写朋友圈短文。");
    expect(context).not.toContain("# 内容工作流阶段");
    expect(context).not.toContain("Tritree");
    expect(context).not.toContain("AI 调用");
  });
});

describe("agent instructions", () => {
  it("asks the main agent to do actual work before offering one real user decision", () => {
    const instructions = buildTreeOptionsInstructions(input);

    expect(instructions.startsWith("# 主 agent 任务")).toBe(true);
    expect(instructions).toContain("先做当前最有用的一步工作");
    expect(instructions).toContain("# actual-work 执行协议");
    expect(instructions).toContain("run_subagent_template");
    expect(instructions).toContain("run_temporary_subagent");
    expect(instructions).toContain("draft、options 或 complete");
    expect(instructions).not.toContain("draft/publish/complete");
    expect(instructions).not.toContain("publish");
    expect(instructions).toContain("enabled Skills 提供角色判断和委托指导");
    expect(instructions).toContain("短任务、最小上下文、期望输出和必要约束");
    expect(instructions).toContain("# 三选一协议");
    expect(instructions).toContain("decisionRationale");
    expect(instructions).toContain("真实用户决策");
    expect(instructions).toContain("三个答案都回答同一个 roundIntent");
    expect(instructions).toContain("三个答案不是三个问题");
    expect(instructions).toContain("三个答案都要回应 roundIntent 里的同一个问题");
    expect(instructions).toContain("description 写这个答案代表的取舍");
    expect(instructions).toContain("impact 写选择后会让后续生成获得什么确定性");
    expect(instructions).toContain("不要返回独立审查报告");
    expect(instructions).not.toContain("# 内容工作流阶段");
    expect(instructions).not.toContain("澄清意图");
    expect(instructions).not.toContain("收口发布");
    expect(instructions).not.toContain("# 总导演任务");
  });

  it("orders main agent sections and keeps three-choice out of draft prompts", () => {
    const draftInstructions = buildTreeDraftInstructions(input);
    const optionsInstructions = buildTreeOptionsInstructions(input);
    const nextStepInstructions = buildTreeNextStepInstructions(input);

    expect(draftInstructions).not.toContain("# 内容工作流阶段");
    expect(draftInstructions).not.toContain("澄清意图");
    expect(draftInstructions).not.toContain("收口发布");
    expect(draftInstructions).not.toContain("# 总导演任务");
    expect(draftInstructions).not.toContain("# 三选一协议");
    expect(draftInstructions).not.toContain("decisionRationale");
    expect(draftInstructions).not.toContain("真实用户决策");

    expect(draftInstructions.startsWith("# 主 agent 任务")).toBe(true);
    expect(draftInstructions).toContain("协调 Skills、工具和 subagents");
    expect(draftInstructions).toContain("提交更新后的 draft");
    expect(draftInstructions).toContain("只生成新的内容版本");
    expect(draftInstructions).toContain("对话中已形成的草稿");
    expect(draftInstructions).toContain("以最新已形成的草稿作为本轮改写对象");
    expect(draftInstructions).toContain("用户明确确认过的表达");
    expect(draftInstructions).not.toContain("当前内容是唯一写作基线");
    expect(draftInstructions).not.toContain("不可改动的用户原文");
    expect(draftInstructions).not.toContain("用户本轮意图和补充要求优先于上一版草稿");
    expect(draftInstructions).toContain("# actual-work 执行协议");
    expect(draftInstructions).toContain("run_subagent_template");
    expect(draftInstructions).toContain("run_temporary_subagent");
    expect(draftInstructions).toContain("必须遵守已启用 Skills");
    expect(draftInstructions).toContain("# 本任务执行规则");
    expect(draftInstructions).toContain("# 输出要求");
    expect(draftInstructions).toContain("# 输出前检查");
    expect(draftInstructions).toContain("要求：先识别当前内容中最影响可信度的事实缺口");
    expect(draftInstructions).toContain("如果本轮列出了可用工具和 MCP 能力，可以按需调用");
    expect(draftInstructions).toContain("未列出时不要假设可以查询外部信息");
    expect(draftInstructions).toContain("本任务产出的用户可见字段包括：roundIntent、draft.title、draft.body、draft.hashtags 和 draft.imagePrompt");
    expect(draftInstructions).toContain("如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果");
    expect(draftInstructions).toContain("这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息");
    expect(draftInstructions).toContain("最终结构化结果必须覆盖：本轮意图、标题、正文、话题和配图提示");
    expect(draftInstructions).toContain("已启用 Skills 明确要求的非中文文本除外");
    expect(draftInstructions).toContain("确认每个已启用 Skill 的要求已落实");
    expect(draftInstructions.indexOf("# 已启用 Skills")).toBeGreaterThan(draftInstructions.indexOf("# 主 agent 任务"));
    expect(draftInstructions.indexOf("# 可用 Subagent 模板")).toBeGreaterThan(draftInstructions.indexOf("# 已启用 Skills"));
    expect(draftInstructions.indexOf("# actual-work 执行协议")).toBeGreaterThan(draftInstructions.indexOf("# 可用 Subagent 模板"));
    expect(draftInstructions.indexOf("# actual-work 执行协议")).toBeLessThan(draftInstructions.indexOf("# 本任务执行规则"));
    expect(draftInstructions.indexOf("# 已启用 Skills")).toBeLessThan(draftInstructions.indexOf("# 本任务执行规则"));
    expect(draftInstructions.indexOf("# 本任务执行规则")).toBeLessThan(draftInstructions.indexOf("# 输出要求"));
    expect(draftInstructions.indexOf("# 输出要求")).toBeLessThan(draftInstructions.indexOf("# 输出前检查"));
    expect(draftInstructions).not.toContain("所有面向用户的字段都必须使用简体中文。");
    expect(draftInstructions).not.toContain("Treeable");
    expect(draftInstructions).not.toContain("Tritree");
    expect(draftInstructions).not.toContain("产品机制");
    expect(draftInstructions).not.toContain("AI Director");
    expect(draftInstructions).not.toContain("one-of-three");
    expect(draftInstructions).not.toContain("AI 调用");
    expect(draftInstructions).not.toContain("返回内容需要包含");
    expect(draftInstructions).not.toContain("Seed：写一段天气文字");
    expect(draftInstructions).not.toContain("用户喜欢具体、自然的表达。");

    expect(optionsInstructions.startsWith("# 主 agent 任务")).toBe(true);
    expect(optionsInstructions).toContain("初始内容");
    expect(optionsInstructions).toContain("修改历程");
    expect(optionsInstructions).toContain("当前内容");
    expect(optionsInstructions).toContain("先做当前最有用的一步工作");
    expect(optionsInstructions).toContain("# 三选一协议");
    expect(optionsInstructions).not.toContain("已出现过的建议标题");
    expect(optionsInstructions).toContain("三个答案的标题和处理角度要有明显区别");
    expect(optionsInstructions).toContain("如果审稿材料里包含“方向范围”");
    expect(optionsInstructions).toContain("把它当作本轮创作发散度");
    expect(optionsInstructions).toContain("发散：同一个问题下");
    expect(optionsInstructions).toContain("平衡：同一个问题下");
    expect(optionsInstructions).toContain("专注：同一个问题下");
    expect(optionsInstructions).not.toContain("先按它决定三个建议之间的距离");
    expect(optionsInstructions).not.toContain("近、中、远的推进梯度");
    expect(optionsInstructions).not.toContain("近距离处理办法");
    expect(optionsInstructions).toContain("必须遵守已启用 Skills");
    expect(optionsInstructions).toContain("# actual-work 执行协议");
    expect(optionsInstructions).toContain("# 本任务执行规则");
    expect(optionsInstructions).toContain("# 输出要求");
    expect(optionsInstructions).toContain("# 输出前检查");
    expect(optionsInstructions).toContain("要求：先识别当前内容中最影响可信度的事实缺口");
    expect(optionsInstructions).toContain("如果本轮列出了可用工具和 MCP 能力，可以按需调用");
    expect(optionsInstructions).toContain("未列出时不要假设可以查询外部信息");
    expect(optionsInstructions).toContain("本任务产出的用户可见字段包括：roundIntent、options[].label、options[].description 和 options[].impact");
    expect(optionsInstructions).toContain("如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果");
    expect(optionsInstructions).toContain("这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息");
    expect(optionsInstructions).toContain("最终结构化结果还必须覆盖一句本轮问题判断");
    expect(optionsInstructions).toContain("已启用 Skills 明确要求的非中文文本除外");
    expect(optionsInstructions).toContain("确认每个已启用 Skill 的要求已落实");
    expect(optionsInstructions.indexOf("# 已启用 Skills")).toBeGreaterThan(optionsInstructions.indexOf("# 主 agent 任务"));
    expect(optionsInstructions.indexOf("# 可用 Subagent 模板")).toBeGreaterThan(optionsInstructions.indexOf("# 已启用 Skills"));
    expect(optionsInstructions.indexOf("# actual-work 执行协议")).toBeGreaterThan(optionsInstructions.indexOf("# 可用 Subagent 模板"));
    expect(optionsInstructions.indexOf("# 三选一协议")).toBeGreaterThan(optionsInstructions.indexOf("# actual-work 执行协议"));
    expect(optionsInstructions.indexOf("# 三选一协议")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
    expect(optionsInstructions.indexOf("# 已启用 Skills")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
    expect(optionsInstructions.indexOf("# 本任务执行规则")).toBeLessThan(optionsInstructions.indexOf("# 输出要求"));
    expect(optionsInstructions.indexOf("# 输出要求")).toBeLessThan(optionsInstructions.indexOf("# 输出前检查"));
    expect(nextStepInstructions.startsWith("# 主 agent 任务")).toBe(true);
    expect(nextStepInstructions).toContain("用户选择一个答案之后，决定下一步 action 是 options、draft 或 complete");
    expect(nextStepInstructions).toContain("可以使用 Skills、工具或 subagents 做必要判断");
    expect(nextStepInstructions).toContain("# actual-work 执行协议");
    expect(nextStepInstructions).toContain("# 三选一协议");
    expect(nextStepInstructions.indexOf("# 三选一协议")).toBeLessThan(nextStepInstructions.indexOf("# 本任务执行规则"));
    expect(nextStepInstructions).not.toContain("# 内容工作流阶段");
    expect(nextStepInstructions).not.toContain("澄清意图");
    expect(nextStepInstructions).not.toContain("收口发布");
    expect(nextStepInstructions).not.toContain("# 总导演任务");
    expect(optionsInstructions).not.toContain("所有面向用户的字段都必须使用简体中文。");
    expect(optionsInstructions).not.toContain("Treeable");
    expect(optionsInstructions).not.toContain("Tritree");
    expect(optionsInstructions).not.toContain("产品机制");
    expect(optionsInstructions).not.toContain("options array");
    expect(optionsInstructions).not.toContain("Option ids");
    expect(optionsInstructions).not.toContain("AI Director");
    expect(optionsInstructions).not.toContain("one-of-three");
    expect(optionsInstructions).not.toContain("AI 调用");
    expect(optionsInstructions).not.toContain("返回内容还需要包含");
    expect(optionsInstructions).not.toContain("Seed：写一段天气文字");
    expect(optionsInstructions).not.toContain("用户喜欢具体、自然的表达。");
  });
});
