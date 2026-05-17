import { describe, expect, it } from "vitest";
import {
  summarizeCurrentDraftOptionsForDirector,
  summarizeEditedDraftForDirector,
  summarizeSelectionRewriteForDirector,
  summarizeSessionForDirector
} from "./app-state";
import type { BranchOption, SessionState, Skill, TreeNode } from "./domain";

describe("summarizeSessionForDirector", () => {
  it("summarizes path, folded branches, and draft for AI context", () => {
    const summary = summarizeSessionForDirector({
      rootMemory: {
        id: "default",
        preferences: {
          seed: "我想写 AI 产品经理的真实困境",
          domains: ["AI"],
          tones: ["calm"],
          styles: ["opinion-driven"],
          personas: ["practitioner"]
        },
        summary: "Seed：我想写 AI 产品经理的真实困境",
        learnedSummary: "Prefers practical angles.",
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z"
      },
      session: {
        id: "session",
        title: "Tree",
        status: "active",
        currentNodeId: "node",
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z"
      },
      currentNode: null,
      currentDraft: { title: "Draft", body: "Body", hashtags: ["#AI"], imagePrompt: "Tree" },
      nodeDrafts: [],
      selectedPath: [],
      foldedBranches: [],
      publishPackage: null
    });

    expect(summary.rootSummary).toBe("Seed：我想写 AI 产品经理的真实困境");
    expect(summary.currentDraft).toContain("Draft");
    expect(summary.learnedSummary).toContain("practical");
  });

  it("includes artifact type instructions in draft and option contexts", () => {
    const state = {
      ...createStateWithPath([]),
      rootMemory: {
        ...createStateWithPath([]).rootMemory,
        preferences: {
          ...createStateWithPath([]).rootMemory.preferences,
          artifactTypeId: "prd" as const,
          seed: "移动端草稿管理"
        },
        summary: "Seed：移动端草稿管理"
      },
      session: {
        ...createStateWithPath([]).session,
        artifactTypeId: "prd" as const
      },
      currentDraft: {
        title: "移动端草稿管理 PRD",
        body: "## 背景\n用户需要移动端继续草稿。",
        hashtags: [],
        imagePrompt: ""
      }
    };

    const draftSummary = summarizeSessionForDirector(state, option("a", "补完整需求"));
    const optionSummary = summarizeCurrentDraftOptionsForDirector(state);
    const draftMessages = (draftSummary as any).messages as Array<{ role: string; content: string }>;
    const optionMessages = (optionSummary as any).messages as Array<{ role: string; content: string }>;

    expect(draftSummary.artifactContext).toContain("作品类型：PRD 文档");
    expect(draftSummary.artifactContext).toContain("hashtags 必须返回空数组");
    expect(optionSummary.artifactContext).toContain("澄清问题和三个答案应该围绕 PRD 决策");
    expect(draftMessages.at(-1)?.content).toContain("作品类型：PRD 文档");
    expect(optionMessages.at(-1)?.content ?? optionMessages[0].content).toContain("作品类型：PRD 文档");
  });

  it("marks the seed draft as an unformed draft in writer and reviewer context", () => {
    const state = {
      ...createStateWithPath([]),
      rootMemory: {
        ...createStateWithPath([]).rootMemory,
        preferences: {
          ...createStateWithPath([]).rootMemory.preferences,
          seed: "我想写 AI 产品经理的真实困境"
        },
        summary: "Seed：我想写 AI 产品经理的真实困境"
      },
      currentDraft: {
        title: "我想写 AI 产品经理的真实困境",
        body: "我想写 AI 产品经理的真实困境",
        hashtags: [],
        imagePrompt: ""
      }
    };

    const draftSummary = summarizeSessionForDirector(state, option("a", "先写第一版"));
    const optionSummary = summarizeCurrentDraftOptionsForDirector(state);
    const draftMessages = (draftSummary as any).messages as Array<{ role: string; content: string }>;
    const optionMessages = (optionSummary as any).messages as Array<{ role: string; content: string }>;

    expect(draftSummary.currentDraft).toContain("当前只有种子念头，尚未形成正式草稿");
    expect(optionSummary.currentDraft).toContain("当前只有种子念头，尚未形成正式草稿");
    expect(draftMessages.at(-2)?.content).toContain("尚未形成正式草稿");
    expect(optionMessages.at(-1)?.content ?? optionMessages[0].content).toContain("尚未形成正式草稿");
    expect(optionMessages.at(-1)?.content ?? optionMessages[0].content).not.toContain("当前内容：\n标题：");
  });

  it("includes user notes for the selected option", () => {
    const summary = summarizeSessionForDirector(
      {
        rootMemory: {
          id: "default",
          preferences: {
            seed: "同事说话越来越怪了",
            domains: ["work"],
            tones: ["sharp"],
            styles: ["opinion-driven"],
            personas: ["observer"]
          },
          summary: "Seed：同事说话越来越怪了",
          learnedSummary: "",
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z"
        },
        session: {
          id: "session",
          title: "Tree",
          status: "active",
          currentNodeId: "node",
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z"
        },
        currentNode: null,
        currentDraft: null,
        nodeDrafts: [],
        selectedPath: [],
        foldedBranches: [],
        publishPackage: null
      },
      {
        id: "custom-user",
        label: "职场黑话",
        description: "从一句办公室黑话切入。",
        impact: "按用户自定义方向继续。",
        kind: "reframe"
      },
      "请保留一点讽刺感。",
      "focused"
    );

    expect(summary.selectedOptionLabel).toContain("职场黑话");
    expect(summary.selectedOptionLabel).toContain("用户补充要求：请保留一点讽刺感。");
    expect(summary.selectedOptionLabel).toContain("方向范围：专注");
    expect(summary.selectedOptionLabel).toContain("沿当前稿已经成立的思路继续推进");
    expect(summary.selectedOptionLabel).not.toContain("硬约束");
    expect(summary.selectedOptionLabel).not.toContain("不主动改换主题、读者、前提或基本结构");
    expect(summary.selectedOptionLabel).not.toContain("三个答案");
    expect(summary.selectedOptionLabel).not.toContain("近距离推进");
    expect(summary.selectedOptionLabel).not.toContain("草稿改动幅度由所选方向决定");
    expect(summary.selectedOptionLabel).not.toContain("本轮写作倾向");
    expect(summary.selectedOptionLabel).not.toContain("收窄和深化");
    expect(summary.selectedOptionLabel).not.toContain("细节深化");
  });

  it("summarizes current-draft option generation with a direction range", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "确定表达主线"),
          option("b", "选择读者视角"),
          option("c", "整理故事推进")
        ],
        selectedOptionId: "b",
        foldedOptions: [option("a", "确定表达主线"), option("c", "整理故事推进")]
      })
    ]);

    const summary = summarizeCurrentDraftOptionsForDirector(state, "divergent");

    expect(summary.selectedOptionLabel).not.toContain("避免重复已有方向");
    expect(summary.selectedOptionLabel).toContain("方向范围：发散");
    expect(summary.selectedOptionLabel).toContain("选项要更有脑洞");
    expect(summary.selectedOptionLabel).not.toContain("硬约束");
    expect(summary.selectedOptionLabel).toContain("更大胆的切入、结构、表达形式或读者场景");
    expect(summary.selectedOptionLabel).not.toContain("不要只是常规编辑动作");
    expect(summary.selectedOptionLabel).not.toContain("草稿改动幅度由所选方向决定");
    expect(summary.selectedOptionLabel).not.toContain("明显不同的创作维度");
    expect(summary.selectedOptionLabel).not.toContain("语义距离");
    expect(summary.selectedOptionLabel).not.toContain("大改");
    expect(summary.selectedOptionLabel).not.toContain("小改");
  });

  it("does not add a direction range hint for the default balanced mode", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [],
        selectedOptionId: null
      })
    ]);

    const draftSummary = summarizeSessionForDirector(state, option("a", "补一个细节"));
    const optionSummary = summarizeCurrentDraftOptionsForDirector(state);
    const draftMessages = (draftSummary as any).messages as Array<{ role: string; content: string }>;
    const optionMessages = (optionSummary as any).messages as Array<{ role: string; content: string }>;

    expect(draftMessages.at(-1)?.content ?? "").not.toContain("方向范围：平衡");
    expect(optionMessages.at(-1)?.content ?? "").not.toContain("方向范围：平衡");
    expect(draftSummary.selectedOptionLabel).not.toContain("方向范围：平衡");
    expect(optionSummary.selectedOptionLabel).not.toContain("方向范围：平衡");
  });

  it("includes saved agent message history in later draft and option prompts", () => {
    const state = createStateWithPath([
      createNode({
        id: "node-1",
        roundIndex: 1,
        options: [],
        selectedOptionId: null,
        agentMessages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "tool-1",
                toolName: "run_skill_command",
                input: { query: "青岛攻略" }
              }
            ]
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "tool-1",
                toolName: "run_skill_command",
                output: { type: "json", value: { feeds: [{ displayTitle: "青岛三天两晚攻略" }] } }
              }
            ]
          }
        ]
      })
    ]);

    const draftSummary = summarizeSessionForDirector(state, option("a", "避开游客打卡视角"));
    const optionSummary = summarizeCurrentDraftOptionsForDirector(state);
    const draftMessages = (draftSummary as any).messages as Array<{ role: string; content: unknown }>;
    const optionMessages = (optionSummary as any).messages as Array<{ role: string; content: unknown }>;

    expect(draftMessages).toContainEqual(expect.objectContaining({ role: "tool", content: expect.any(Array) }));
    expect(JSON.stringify(draftMessages)).toContain("青岛三天两晚攻略");
    expect(optionMessages).toContainEqual(expect.objectContaining({ role: "tool", content: expect.any(Array) }));
    expect(JSON.stringify(optionMessages)).toContain("青岛三天两晚攻略");
  });

  it("puts the direction range into editor conversation messages", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "确定表达主线"),
          option("b", "选择读者视角"),
          option("c", "整理故事推进")
        ],
        selectedOptionId: "b",
        foldedOptions: [option("a", "确定表达主线"), option("c", "整理故事推进")]
      })
    ]);

    const summary = summarizeCurrentDraftOptionsForDirector(state, "focused");
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const finalMessage = messages.at(-1)?.content ?? "";

    expect(finalMessage).toContain("本轮要求：");
    expect(finalMessage).toContain("方向范围：专注");
    expect(finalMessage).toContain("沿当前稿已经成立的思路继续推进");
    expect(finalMessage).not.toContain("不要主动改换主题、读者、前提或基本结构");
    expect(finalMessage).not.toContain("近距离的三种处理办法");
    expect(finalMessage.indexOf("本轮要求：")).toBeLessThan(finalMessage.indexOf("当前内容："));
  });

  it("includes previous and current option labels so the director can avoid repeats", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "扩写成完整草稿"),
          option("b", "锁定写给谁看"),
          option("c", "重组为问题-解决结构")
        ],
        selectedOptionId: "b",
        foldedOptions: [option("a", "扩写成完整草稿"), option("c", "重组为问题-解决结构")]
      }),
      createNode({
        id: "current",
        parentId: "root",
        parentOptionId: "b",
        roundIndex: 2,
        options: [
          option("a", "展开值班全过程"),
          option("b", "锁定写给谁看"),
          option("c", "重组为问题-解决结构")
        ],
        selectedOptionId: null
      })
    ]);

    const summary = summarizeSessionForDirector(state, option("c", "重组为问题-解决结构"));

    expect(summary.pathSummary).toBe("");
    expect(summary.foldedSummary).toBe("");
    expect(summary.selectedOptionLabel).toContain("重组为问题-解决结构");
  });

  it("represents draft history as writing intentions and version summaries", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "扩写完整经历"),
          option("b", "分析为什么写"),
          option("c", "确定写给谁看")
        ],
        selectedOptionId: "c",
        foldedOptions: [option("a", "扩写完整经历"), option("b", "分析为什么写")]
      }),
      createNode({
        id: "current",
        parentId: "root",
        parentOptionId: "c",
        roundIndex: 2,
        options: [
          option("a", "扩写完整故事线"),
          option("b", "分析做这个的动机"),
          option("c", "明确写给谁看")
        ],
        selectedOptionId: null
      })
    ]);
    state.nodeDrafts = [
      {
        nodeId: "root",
        draft: {
          title: "旧版标题",
          body: "这是一段旧版正文，应该只作为摘要来源，而不应该完整进入 draft 历史消息。",
          hashtags: ["#旧版"],
          imagePrompt: "旧图"
        }
      }
    ];

    const summary = summarizeSessionForDirector(state, option("b", "分析做这个的动机"));
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(messages[1].content).toContain("第 1 版已形成版本摘要");
    expect(messages[1].content).not.toContain("采用的写作意图");
    expect(messages[1].content).toContain("旧版标题");
    expect(messages[1].content).not.toContain("正文：这是一段旧版正文，应该只作为摘要来源，而不应该完整进入 draft 历史消息。");
    expect(messages[1].content).not.toContain("选项：");
    expect(messages[2].content).toBe("确定写给谁看: 确定写给谁看的说明。");
    expect(messages[2].content).not.toContain("历史已选方向");
    expect(messages[2].content).not.toContain("下一步写作意图");
    expect(messages[2].content).not.toContain("用户选择");
    expect(messages[3].content).toContain("第 2 版已形成草稿");
    expect(messages[3].content).not.toContain("采用的写作意图");
    expect(messages[3].content).toContain("配图提示");
    expect(messages[3].content).not.toContain("选项：");
    expect(messages[4].content).toContain("分析做这个的动机");
    expect(messages[4].content).not.toContain("用户想要完成的写作意图");
    expect(messages[4].content).not.toContain("请按本轮写作意图生成新的内容版本");
    expect(messages[4].content).not.toContain("当前内容是本轮唯一写作基线");
    expect(messages[4].content).not.toContain("先按已选技能判断当前内容状态和改动幅度");
    expect(messages[4].content).not.toContain("保留当前内容中已经成立的部分");
    expect(messages[4].content).not.toContain("已选技能是创作判断镜头");
    expect(messages[4].content).not.toContain("实质变化");
    expect(messages[4].content).not.toContain("会怎么改");
    expect(messages[4].content).not.toContain("当前内容：");
    expect(messages[4].content).not.toContain("配图提示");
    expect(messages[4].content).not.toContain("用户刚刚选择");
    expect(messages[4].content).not.toContain("三选一");
    expectNoProcessTerms(messages[4].content);
  });

  it("asks draft generation to apply the selected direction to the draft", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "确定表达主线"),
          option("b", "选择读者视角"),
          option("c", "整理故事推进")
        ],
        selectedOptionId: "b",
        foldedOptions: [option("a", "确定表达主线"), option("c", "整理故事推进")]
      })
    ]);

    const summary = summarizeSessionForDirector(state, option("b", "选择读者视角"), "写给独立开发者");
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const finalMessage = messages.at(-1)?.content ?? "";

    expect(finalMessage).toContain("选择读者视角");
    expect(finalMessage).not.toContain("用户想要完成的写作意图");
    expect(finalMessage).not.toContain("请按本轮写作意图生成新的内容版本");
    expect(finalMessage).not.toContain("先按已选技能判断当前内容状态和改动幅度");
    expect(finalMessage).not.toContain("保留当前内容中已经成立的部分");
    expect(finalMessage).not.toContain("实质变化");
    expect(finalMessage).toContain("用户补充要求：写给独立开发者");
    expect(finalMessage).not.toContain("提出三选一建议");
    expect(finalMessage).not.toContain("生成下一步三个创作方向");
    expect(finalMessage).not.toContain("用户刚刚选择");
    expect(finalMessage).not.toContain("选项");
    expectNoProcessTerms(finalMessage);
  });

  it("puts the current generated draft in assistant history instead of the final user request", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 3,
        options: [
          option("a", "换成行业观察"),
          option("b", "压缩三段对比"),
          option("c", "补需求理解")
        ],
        selectedOptionId: null
      })
    ]);
    state.currentDraft = {
      title: "用AI写代码，人和人的差距到底在哪",
      body: "比如我知道要做啥——不是“帮我写个登录功能”这种。",
      hashtags: ["#AI编程"],
      imagePrompt: "多屏幕代码工作台"
    };

    const summary = summarizeSessionForDirector(
      state,
      option("a", "换成行业观察"),
      "知道要做啥指的是我知道用户需求，而不是被动接受任务。"
    );
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const assistantHistory = messages[1].content;
    const finalUserRequest = messages.at(-1)?.content ?? "";

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(assistantHistory).toContain("第 3 版已形成草稿");
    expect(assistantHistory).not.toContain("采用的写作意图");
    expect(assistantHistory).toContain("正文：比如我知道要做啥——不是“帮我写个登录功能”这种。");
    expect(finalUserRequest).toContain("换成行业观察");
    expect(finalUserRequest).not.toContain("用户想要完成的写作意图");
    expect(finalUserRequest).toContain("用户补充要求：知道要做啥指的是我知道用户需求，而不是被动接受任务。");
    expect(finalUserRequest).not.toContain("当前内容：");
    expect(finalUserRequest).not.toContain("帮我写个登录功能");
  });

  it("formats selected text reference directions as local rewrite requests", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 2,
        options: [],
        selectedOptionId: null
      })
    ]);
    const selectedText = "我这边更像：先把整个模块拆成几块，同时开几个窗口并行出草稿。";
    const selectedOption: BranchOption = {
      id: "custom-reference-test",
      label: "同时做几个不相关需求",
      description: `用户引用文本：\n「${selectedText}」\n\n用户要求：是同时做几个不相关需求，不是一个需求拆一堆方向，另外现在这一段已经太长了`,
      impact: "按引用文本和用户要求改写这一段。",
      kind: "reframe"
    };

    const summary = summarizeSessionForDirector(state, selectedOption, undefined, "balanced");
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const finalUserRequest = messages.at(-1)?.content ?? "";

    expect(finalUserRequest).toContain("用户引用文本：");
    expect(finalUserRequest).toContain(selectedText);
    expect(finalUserRequest).toContain("用户要求：是同时做几个不相关需求");
    expect(finalUserRequest).not.toContain("用户想要完成的写作意图");
    expect(finalUserRequest).not.toContain("引用选中文本继续生成");
    expect(finalUserRequest).not.toContain("方向范围：");
    expect(finalUserRequest).not.toContain("中规中矩的稳妥改法");
  });

  it("includes current node option labels when regenerating options for an existing draft", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 1,
        options: [option("a", "展开值班全过程"), option("b", "锁定写给谁看"), option("c", "重组为问题-解决结构")],
        selectedOptionId: null
      })
    ]);

    const summary = summarizeCurrentDraftOptionsForDirector(state);

    expect(summary.pathSummary).toBe("");
    expect(summary.selectedOptionLabel).toBe("");
  });

  it("asks the editor agent for first-round suggestions with initial and current content", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 1,
        options: [],
        selectedOptionId: null
      })
    ]);

    const summary = summarizeCurrentDraftOptionsForDirector(state);
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;

    expect(messages.map((message) => message.role)).toEqual(["user"]);
    expect(messages[0].content).toContain("初始内容：");
    expect(messages[0].content).toContain("当前内容：");
    expect(messages[0].content).toContain("本轮审稿材料：");
    expect(messages[0].content).not.toContain("请作为责任编辑");
    expect(messages[0].content).not.toContain("提出三个建议");
    expect(messages[0].content).not.toContain("AI Director");
    expect(messages[0].content).not.toContain("三选一");
    expect(messages[0].content).not.toContain("第 1 轮 AI 输出");
    expectNoProcessTerms(messages[0].content);
    expectNoProcessTerms(summary.selectedOptionLabel);
  });

  it("gives the editor agent revision history from an editorial perspective", () => {
    const state = createStateWithPath([
      createNode({
        id: "root",
        roundIndex: 1,
        options: [
          option("a", "扩写完整经历"),
          option("b", "分析为什么写"),
          option("c", "确定写给谁看")
        ],
        selectedOptionId: "c",
        foldedOptions: [option("a", "扩写完整经历"), option("b", "分析为什么写")]
      }),
      createNode({
        id: "current",
        parentId: "root",
        parentOptionId: "c",
        roundIndex: 2,
        options: [],
        selectedOptionId: null
      })
    ]);

    const summary = summarizeCurrentDraftOptionsForDirector(state);
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const finalMessage = messages.at(-1)?.content ?? "";

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0].content).toContain("初始内容：");
    expect(messages[1].content).toContain("第 1 次澄清问题摘要");
    expect(messages[1].content).toContain("答案标题：扩写完整经历；分析为什么写；确定写给谁看");
    expect(messages[1].content).not.toContain("扩写完整经历的说明");
    expect(finalMessage).toContain("最近一次修改：确定写给谁看");
    expect(finalMessage).not.toContain("确定写给谁看的说明");
    expect(finalMessage).toContain("确定写给谁看");
    expect(finalMessage).toContain("当前内容：");
    expect(finalMessage).toContain("本轮审稿材料：");
    expect(finalMessage).not.toContain("暂未采纳");
    expect(finalMessage).not.toContain("已出现过的建议");
    expect(finalMessage).not.toContain("扩写完整经历；分析为什么写");
    expect(finalMessage).not.toContain("扩写完整经历的说明");
    expect(finalMessage.indexOf("当前内容：")).toBeLessThan(finalMessage.indexOf("最近一次修改："));
    expect(finalMessage).not.toContain("请作为责任编辑");
    expect(finalMessage).not.toContain("提出三个建议");
    expect(finalMessage).not.toContain("用户刚刚选择");
    expect(finalMessage).not.toContain("用户选择");
    expect(finalMessage).not.toContain("三选一");
    expectNoProcessTerms(finalMessage);
  });

  it("uses the nearest ancestor draft when the current clarification node has no draft", () => {
    const parent = createNode({
      id: "root",
      roundIndex: 1,
      options: [
        option("a", "说明系统范围"),
        option("b", "说明目标风格"),
        option("c", "说明验收标准")
      ],
      selectedOptionId: "a"
    });
    const clarification = createNode({
      id: "clarify",
      parentId: "root",
      parentOptionId: "a",
      roundIndex: 2,
      options: [option("a", "只改后台"), option("b", "只改前台"), option("c", "前后台都改")],
      selectedOptionId: null
    });
    const state = {
      ...createStateWithPath([parent, clarification]),
      currentDraft: null,
      nodeDrafts: [
        {
          nodeId: "root",
          draft: { title: "旧 PRD", body: "## 背景\n旧内容", hashtags: [], imagePrompt: "" }
        }
      ]
    };

    const summary = summarizeSessionForDirector(state, clarification.options[0]);

    expect(summary.currentDraft).toContain("旧 PRD");
    expect(summary.currentDraft).toContain("旧内容");
  });

  it("asks for editorial suggestions after edited content without UI process language", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 1,
        options: [option("a", "展开值班全过程"), option("b", "锁定写给谁看"), option("c", "重组为问题-解决结构")],
        selectedOptionId: null
      })
    ]);

    const summary = summarizeEditedDraftForDirector(state, {
      title: "Edited",
      body: "Edited body",
      hashtags: ["#edit"],
      imagePrompt: "Edited image"
    });
    const messages = (summary as any).messages as Array<{ role: string; content: string }>;
    const finalMessage = messages.at(-1)?.content ?? "";

    expect(finalMessage).toContain("审稿材料：");
    expect(finalMessage).toContain("当前内容：");
    expect(finalMessage).not.toContain("请作为责任编辑");
    expect(finalMessage).not.toContain("提出三个建议");
    expectNoProcessTerms(finalMessage);
    expectNoProcessTerms(summary.selectedOptionLabel);
  });

  it("excludes folded branches that are outside the current path", () => {
    const state = createStateWithPath([
      createNode({
        id: "current",
        roundIndex: 1,
        options: [option("a", "展开值班全过程"), option("b", "锁定写给谁看"), option("c", "重组为问题-解决结构")],
        selectedOptionId: "a",
        foldedOptions: [option("b", "锁定写给谁看")]
      })
    ]);
    state.foldedBranches = [
      ...state.foldedBranches,
      {
        id: "off-path",
        nodeId: "old-route",
        option: option("c", "旧路线里的选项"),
        createdAt: "2026-04-24T00:00:00.000Z"
      }
    ];

    const summary = summarizeCurrentDraftOptionsForDirector(state);

    expect(summary.foldedSummary).toBe("");
    expect(summary.foldedSummary).not.toContain("旧路线里的选项");
    expect(summary.pathSummary).not.toContain("旧路线里的选项");
  });

  it("uses only writer and shared skills for selection rewrite", () => {
    const state = createStateWithPath([]);
    state.enabledSkills = [
      skill("writer-skill", "自然短句", "writer"),
      skill("editor-skill", "逻辑链审查", "editor"),
      skill("shared-skill", "标题不要夸张", "both")
    ];

    const summary = summarizeSelectionRewriteForDirector(
      state,
      { title: "标题", body: "第一句。第二句。", hashtags: [], imagePrompt: "" },
      "第一句",
      "改自然一点",
      "body"
    );

    expect(summary.enabledSkills.map((item) => item.title)).toEqual(["自然短句", "标题不要夸张"]);
  });
});

function expectNoProcessTerms(text: string) {
  const forbiddenTerms = [
    "当前草稿已经展示",
    "展示给用户",
    "用户手动编辑",
    "保存了当前草稿",
    "用户刚刚",
    "用户选择",
    "三选一",
    "AI Director",
    "Tritree",
    "Treeable",
    "产品机制",
    "整体流程",
    "工作台",
    "页面",
    "界面",
    "下一步三个创作方向",
    "当前路径",
    "已选路径",
    "未选方向",
    "请作为责任编辑",
    "提出三个建议",
    "请按本轮写作意图生成新的内容版本"
  ];

  for (const term of forbiddenTerms) {
    expect(text).not.toContain(term);
  }
}

function option(id: BranchOption["id"], label: string): BranchOption {
  return {
    id,
    label,
    description: `${label}的说明。`,
    impact: `${label}的影响。`,
    kind: id === "b" ? "deepen" : id === "c" ? "reframe" : "explore"
  };
}

function skill(id: string, title: string, appliesTo: "writer" | "editor" | "both"): Skill {
  return {
    id,
    title,
    category: appliesTo === "writer" ? "风格" : "检查",
    description: `${title}说明`,
    prompt: `${title}提示词`,
    appliesTo,
    isSystem: false,
    defaultEnabled: false,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };
}

function createNode(overrides: {
  id: string;
  parentId?: string | null;
  parentOptionId?: BranchOption["id"] | null;
  roundIndex: number;
  options: BranchOption[];
  selectedOptionId: BranchOption["id"] | null;
  foldedOptions?: BranchOption[];
  agentMessages?: TreeNode["agentMessages"];
}): TreeNode {
  return {
    id: overrides.id,
    sessionId: "session",
    parentId: overrides.parentId ?? null,
    parentOptionId: overrides.parentOptionId ?? null,
    roundIndex: overrides.roundIndex,
    roundIntent: `第 ${overrides.roundIndex} 轮意图`,
    options: overrides.options,
    selectedOptionId: overrides.selectedOptionId,
    foldedOptions: overrides.foldedOptions ?? [],
    agentMessages: overrides.agentMessages ?? [],
    createdAt: "2026-04-24T00:00:00.000Z"
  };
}

function createStateWithPath(selectedPath: TreeNode[]): SessionState {
  return {
    rootMemory: {
      id: "default",
      preferences: {
        seed: "值班时写了个微博内容生成器",
        domains: ["work"],
        tones: ["sharp"],
        styles: ["opinion-driven"],
        personas: ["observer"]
      },
      summary: "Seed：值班时写了个微博内容生成器",
      learnedSummary: "",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z"
    },
    session: {
      id: "session",
      title: "Tree",
      status: "active",
      currentNodeId: selectedPath.at(-1)?.id ?? null,
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z"
    },
    currentNode: selectedPath.at(-1) ?? null,
    currentDraft: { title: "Draft", body: "Body", hashtags: [], imagePrompt: "" },
    nodeDrafts: [],
    selectedPath,
    treeNodes: selectedPath,
    foldedBranches: selectedPath.flatMap((node) =>
      node.foldedOptions.map((foldedOption) => ({
        id: `${node.id}-${foldedOption.id}`,
        nodeId: node.id,
        option: foldedOption,
        createdAt: "2026-04-24T00:00:00.000Z"
      }))
    ),
    publishPackage: null
  };
}
