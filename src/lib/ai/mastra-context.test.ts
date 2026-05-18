import { describe, expect, it } from "vitest";
import {
  buildSharedAgentContext,
  buildTreeArtifactInstructions,
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

const shellInput = {
  rootSummary: "",
  learnedSummary: "",
  enabledSkills: [],
  subagentTemplateSummaries: ["research｜资料核查：核查一个具体事实。"],
  toolSummaries: [
    "run_subagent_template：运行预创建子代理模板；运行时会提供当前上下文视图。",
    "run_custom_subagent：运行自定义子代理；运行时会提供当前上下文视图。",
    "submit_tree_artifact：最终提交工具。",
    "submit_tree_next_step：最终提交工具。",
    "submit_tree_options：最终提交工具。"
  ]
} satisfies SharedAgentContextInput;

describe("buildSharedAgentContext", () => {
  it("loads enabled skill prompts as active instructions without injecting session data", () => {
    const context = buildSharedAgentContext(input);

    expect(context).toContain("# 已启用 Skills");
    expect(context).toContain("以下 Skills 已加载为 active instructions");
    expect(context).toContain("每个 Skill 的要求都必须遵守");
    expect(context).toContain("## Skill: 资料员");
    expect(context).toContain("适用目标：全程");
    expect(context).toContain("说明：负责判断资料缺口，并建议是否委托检索或核查。");
    expect(context).toContain("要求：先识别当前内容中最影响可信度的事实缺口；必要时建议委托资料型 subagent 做最小范围核查。");
    expect(context).toContain("## Skill: 朋友圈语气");
    expect(context).toContain("适用目标：artifact");
    expect(context).toContain("## Skill: 结构审读");
    expect(context).toContain("适用目标：options/next-step");
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
    expect(context).not.toContain("AI Director");
  });
});

describe("agent instructions", () => {
  it("keeps the main prompt as a generic ReAct shell", () => {
    const instructions = [
      buildTreeArtifactInstructions(shellInput),
      buildTreeOptionsInstructions(shellInput),
      buildTreeNextStepInstructions(shellInput)
    ].join("\n\n---\n\n");

    expect(instructions).toContain("你是通用 ReAct agent");
    expect(instructions).toContain("系统提示词只定义执行边界、工具协议和最终提交契约");
    expect(instructions).toContain("优先由主 agent 自己处理");
    expect(instructions).toContain("优先使用 run_subagent_template");
    expect(instructions).toContain("才使用 run_custom_subagent");
    expect(instructions).toContain("调用 subagent 时给出短任务、期望输出和必要约束");
    expect(instructions).toContain("运行时会为 subagent 提供当前上下文视图");
    expect(instructions).toContain("subagent 作为工具使用，其返回值不是最终判断");
    expect(instructions).toContain("必须检查工具返回值");
    expect(instructions).toContain("不要把“已调用工具或 subagent”当作本轮完成");
    expect(instructions).toContain("submit_tree_options");
    expect(instructions).not.toContain("临时");
    expect(instructions).not.toContain("# 内容工作流阶段");
    expect(instructions).not.toContain("# 总导演任务");
    expect(instructions).not.toContain("# 产物生成任务");

    for (const businessPhrase of [
      "创作状态",
      "创作 seed",
      "当前作品",
      "读者",
      "主线",
      "事实缺口",
      "审稿材料",
      "发散：",
      "平衡：",
      "专注：",
      "发布前",
      "写作者"
    ]) {
      expect(instructions).not.toContain(businessPhrase);
    }
  });

  it("keeps target differences limited to final tool contracts", () => {
    const artifactInstructions = buildTreeArtifactInstructions(shellInput);
    const optionsInstructions = buildTreeOptionsInstructions(shellInput);
    const nextStepInstructions = buildTreeNextStepInstructions(shellInput);

    expect(artifactInstructions.startsWith("# ReAct Agent")).toBe(true);
    expect(artifactInstructions).toContain("本轮固定目标：提交 artifact 结果");
    expect(artifactInstructions).toContain("submit_tree_artifact");
    expect(artifactInstructions).toContain("artifact.type、artifact.payload 和 artifact.sourceArtifactIds");
    expect(artifactInstructions).not.toContain("# 三选一交互协议");

    expect(optionsInstructions.startsWith("# ReAct Agent")).toBe(true);
    expect(optionsInstructions).toContain("本轮固定目标：提交 options 结果");
    expect(optionsInstructions).toContain("# 三选一交互协议");
    expect(optionsInstructions).toContain("三个 option 都必须回答同一个 roundIntent");
    expect(optionsInstructions).toContain("submit_tree_options");
    expect(optionsInstructions).toContain("options[].label、options[].description 和 options[].impact");

    expect(nextStepInstructions.startsWith("# ReAct Agent")).toBe(true);
    expect(nextStepInstructions).toContain("本轮固定目标：提交 next-step 路由结果");
    expect(nextStepInstructions).toContain("action 只能是 options、artifact 或 complete");
    expect(nextStepInstructions).toContain("submit_tree_next_step");

    expect(artifactInstructions.indexOf("# 已启用 Skills")).toBeGreaterThan(artifactInstructions.indexOf("# ReAct Agent"));
    expect(artifactInstructions.indexOf("# ReAct 执行协议")).toBeGreaterThan(artifactInstructions.indexOf("# 已启用 Skills"));
    expect(artifactInstructions.indexOf("# 本轮固定目标")).toBeGreaterThan(artifactInstructions.indexOf("# ReAct 执行协议"));
    expect(artifactInstructions.indexOf("# 输出契约")).toBeGreaterThan(artifactInstructions.indexOf("# 本轮固定目标"));
  });
});
