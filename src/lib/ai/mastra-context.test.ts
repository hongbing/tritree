import { describe, expect, it } from "vitest";
import {
  buildSharedAgentContext,
  buildTreeArtifactInstructions,
  buildTreeOptionsInstructions,
  type SharedAgentContextInput
} from "./mastra-context";

const input = {
  rootSummary: "Seed：写一段天气文字",
  learnedSummary: "用户喜欢具体、自然的表达。",
  longTermMemory: "用户常写朋友圈短文。",
  enabledSkills: [
    {
      id: "system-workflow",
      title: "内容创作流程",
      category: "方向",
      description: "判断内容所处阶段，并控制改动幅度。",
      prompt: "种子或零散想法阶段可以大幅组织材料；当任务是设计澄清问题和答案时，基本成稿阶段应避免所有答案都给重构。",
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
    }
  ],
  availableSkillSummaries: ["小红书标题：生成适合小红书的标题。"],
  toolSummaries: ["get_weather：查询指定地点天气。"]
} satisfies SharedAgentContextInput;

describe("buildSharedAgentContext", () => {
  it("loads every enabled skill prompt as active instructions", () => {
    const context = buildSharedAgentContext(input);

    expect(context).toContain("# 已启用 Skills");
    expect(context).toContain("以下 Skills 已加载为本轮任务指令");
    expect(context).toContain("每个 Skill 的「要求」都必须遵守");
    expect(context).toContain("如果 Skill 之间出现冲突");
    expect(context).toContain("## Skill: 内容创作流程");
    expect(context).toContain("说明：判断内容所处阶段，并控制改动幅度。");
    expect(context).toContain("要求：种子或零散想法阶段可以大幅组织材料；当任务是设计澄清问题和答案时，基本成稿阶段应避免所有答案都给重构。");
    expect(context).toContain("## Skill: 朋友圈语气");
    expect(context).toContain("说明：更像自然分享。");
    expect(context).toContain("要求：使用自然、轻松、不过度修饰的朋友圈语气。");
    expect(context).not.toContain("内容创作流程（方向）");
    expect(context).not.toContain("朋友圈语气（风格）");
    expect(context).toContain("小红书标题：生成适合小红书的标题。");
    expect(context).toContain("get_weather：查询指定地点天气。");
    expect(context).not.toContain("Seed：写一段天气文字");
    expect(context).not.toContain("用户喜欢具体、自然的表达。");
    expect(context).not.toContain("用户常写朋友圈短文。");
    expect(context).not.toContain("Tritree");
    expect(context).not.toContain("AI 调用");
  });
});

describe("agent instructions", () => {
  it("asks the director to turn diagnosis into one question and three answers", () => {
    const instructions = buildTreeOptionsInstructions(input);

    expect(instructions).toContain("先诊断当前产物最需要用户决定的一个问题");
    expect(instructions).toContain("三个答案不是三个问题");
    expect(instructions).toContain("按当前产物的问题程度和后续生成收益决定这个问题的优先级");
    expect(instructions).toContain("不要预设必须询问某一类问题");
    expect(instructions).toContain("文案表达、断句和分段整理是任何阶段都可以成为可选答案");
    expect(instructions).toContain("表达本身已经承载了主要信息，只是长段、口语散、层次不清或局部不顺");
    expect(instructions).toContain("可以给保留原意的表达优化答案");
    expect(instructions).toContain("不要因为内容还没到发布前就排除这类答案");
    expect(instructions).toContain("三个答案都要回应 roundIntent 里的同一个问题");
    expect(instructions).toContain("description 写这个答案代表的取舍");
    expect(instructions).toContain("impact 写选择后会让后续生成获得什么确定性");
    expect(instructions).toContain("不要返回独立审查报告");
  });

  it("uses separate writer and director roles without leaking the tree choice mechanic", () => {
    const artifactInstructions = buildTreeArtifactInstructions(input);
    const optionsInstructions = buildTreeOptionsInstructions(input);

    expect(artifactInstructions.startsWith("# 产物生成任务")).toBe(true);
    expect(artifactInstructions).toContain("产物生成器");
    expect(artifactInstructions).toContain("用户想要完成的本轮意图");
    expect(artifactInstructions).toContain("只生成新的产物版本");
    expect(artifactInstructions).toContain("对话中已形成的产物");
    expect(artifactInstructions).toContain("以最新已形成的产物作为本轮生成基线");
    expect(artifactInstructions).toContain("用户明确确认过的表达");
    expect(artifactInstructions).not.toContain("当前内容是唯一写作基线");
    expect(artifactInstructions).not.toContain("不可改动的用户原文");
    expect(artifactInstructions).not.toContain("用户本轮意图和补充要求优先于上一版作品");
    expect(artifactInstructions).toContain("必须遵守已启用 Skills");
    expect(artifactInstructions).toContain("# 本任务执行规则");
    expect(artifactInstructions).toContain("# 输出要求");
    expect(artifactInstructions).toContain("# 输出前检查");
    expect(artifactInstructions).toContain("要求：种子或零散想法阶段可以大幅组织材料");
    expect(artifactInstructions).toContain("如果本轮列出了可用工具和 MCP 能力，可以按需调用");
    expect(artifactInstructions).toContain("未列出时不要假设可以查询外部信息");
    expect(artifactInstructions).toContain("本任务产出的用户可见字段包括：roundIntent、artifact.type、artifact.payload 和 artifact.sourceArtifactIds");
    expect(artifactInstructions).toContain("artifact.payload 必须遵守作品类型与输出结构里的字段、格式和交付要求");
    expect(artifactInstructions).toContain("如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果");
    expect(artifactInstructions).toContain("这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息");
    expect(artifactInstructions).toContain("最终结构化结果必须覆盖：本轮意图和一个符合产物插件结构的 artifact");
    expect(artifactInstructions).toContain("已启用 Skills 明确要求的非中文文本除外");
    expect(artifactInstructions).toContain("确认每个已启用 Skill 的要求已落实");
    expect(artifactInstructions.indexOf("# 已启用 Skills")).toBeGreaterThan(artifactInstructions.indexOf("# 产物生成任务"));
    expect(artifactInstructions.indexOf("# 已启用 Skills")).toBeLessThan(artifactInstructions.indexOf("# 本任务执行规则"));
    expect(artifactInstructions.indexOf("# 本任务执行规则")).toBeLessThan(artifactInstructions.indexOf("# 输出要求"));
    expect(artifactInstructions.indexOf("# 输出要求")).toBeLessThan(artifactInstructions.indexOf("# 输出前检查"));
    expect(artifactInstructions).not.toContain("所有面向用户的字段都必须使用简体中文。");
    expect(artifactInstructions).not.toContain("Treeable");
    expect(artifactInstructions).not.toContain("Tritree");
    expect(artifactInstructions).not.toContain("产品机制");
    expect(artifactInstructions).not.toContain("AI Director");
    expect(artifactInstructions).not.toContain("三选一");
    expect(artifactInstructions).not.toContain("one-of-three");
    expect(artifactInstructions).not.toContain("AI 调用");
    expect(artifactInstructions).not.toContain("返回内容需要包含");
    expect(artifactInstructions).not.toContain("work.");
    expect(artifactInstructions).not.toContain("submit_tree_artifact");
    expect(artifactInstructions).not.toContain("Seed：写一段天气文字");
    expect(artifactInstructions).not.toContain("用户喜欢具体、自然的表达。");

    expect(optionsInstructions.startsWith("# 总导演任务")).toBe(true);
    expect(optionsInstructions).toContain("澄清问题设计者");
    expect(optionsInstructions).toContain("初始内容");
    expect(optionsInstructions).toContain("修改历程");
    expect(optionsInstructions).toContain("当前产物");
    expect(optionsInstructions).toContain("一个当前最值得让用户回答的问题");
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
    expect(optionsInstructions).toContain("# 本任务执行规则");
    expect(optionsInstructions).toContain("# 输出要求");
    expect(optionsInstructions).toContain("# 输出前检查");
    expect(optionsInstructions).toContain("要求：种子或零散想法阶段可以大幅组织材料");
    expect(optionsInstructions).toContain("如果本轮列出了可用工具和 MCP 能力，可以按需调用");
    expect(optionsInstructions).toContain("未列出时不要假设可以查询外部信息");
    expect(optionsInstructions).toContain("本任务产出的用户可见字段包括：roundIntent、options[].label、options[].description 和 options[].impact");
    expect(optionsInstructions).toContain("如果 Skill 要求固定文本、格式、语气或其他可观察结果，最终返回字段里必须能直接看见对应结果");
    expect(optionsInstructions).toContain("这里的输出要求指结构化结果或最终提交工具参数里的字段，不是额外自然语言消息");
    expect(optionsInstructions).toContain("最终结构化结果还必须覆盖一句本轮问题判断");
    expect(optionsInstructions).toContain("已启用 Skills 明确要求的非中文文本除外");
    expect(optionsInstructions).toContain("确认每个已启用 Skill 的要求已落实");
    expect(optionsInstructions.indexOf("# 已启用 Skills")).toBeGreaterThan(optionsInstructions.indexOf("# 责任编辑任务"));
    expect(optionsInstructions.indexOf("# 已启用 Skills")).toBeLessThan(optionsInstructions.indexOf("# 本任务执行规则"));
    expect(optionsInstructions.indexOf("# 本任务执行规则")).toBeLessThan(optionsInstructions.indexOf("# 输出要求"));
    expect(optionsInstructions.indexOf("# 输出要求")).toBeLessThan(optionsInstructions.indexOf("# 输出前检查"));
    expect(optionsInstructions).not.toContain("所有面向用户的字段都必须使用简体中文。");
    expect(optionsInstructions).not.toContain("Treeable");
    expect(optionsInstructions).not.toContain("Tritree");
    expect(optionsInstructions).not.toContain("产品机制");
    expect(optionsInstructions).not.toContain("options array");
    expect(optionsInstructions).not.toContain("Option ids");
    expect(optionsInstructions).not.toContain("AI Director");
    expect(optionsInstructions).not.toContain("三选一");
    expect(optionsInstructions).not.toContain("one-of-three");
    expect(optionsInstructions).not.toContain("AI 调用");
    expect(optionsInstructions).not.toContain("返回内容还需要包含");
    expect(optionsInstructions).not.toContain("Seed：写一段天气文字");
    expect(optionsInstructions).not.toContain("用户喜欢具体、自然的表达。");
  });
});
