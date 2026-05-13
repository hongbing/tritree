import { describe, expect, it } from "vitest";
import {
  BranchOptionSchema,
  DEFAULT_SYSTEM_SKILLS,
  DirectorOptionsOutputSchema,
  DirectorNextStepOutputSchema,
  DirectorOutputSchema,
  RootPreferencesSchema,
  SessionStateSchema,
  SkillSchema,
  SkillUpsertSchema,
  requireThreeOptions,
  skillsForTarget
} from "./domain";

describe("RootPreferencesSchema", () => {
  it("accepts a seed-driven first-run shape", () => {
    const result = RootPreferencesSchema.parse({
      seed: "我想写 AI 产品经理的真实困境",
      domains: ["AI", "product"],
      tones: ["calm"],
      styles: ["opinion-driven"],
      personas: ["practitioner"]
    });

    expect(result.seed).toBe("我想写 AI 产品经理的真实困境");
    expect(result.domains).toEqual(["AI", "product"]);
  });

  it("keeps old preference rows readable when seed is missing", () => {
    const result = RootPreferencesSchema.parse({
      domains: ["AI"],
      tones: ["calm"],
      styles: ["opinion-driven"],
      personas: ["practitioner"]
    });

    expect(result.seed).toBe("");
    expect(result).not.toHaveProperty("initialOptionId");
    expect(result).not.toHaveProperty("initialOptionMode");
  });

  it("defaults and trims creation request", () => {
    const result = RootPreferencesSchema.parse({
      seed: "我想写 AI 产品经理的真实困境",
      creationRequest: " 改成英文的，保留口语感 ",
      domains: ["AI", "product"],
      tones: ["calm"],
      styles: ["opinion-driven"],
      personas: ["practitioner"]
    });

    expect(result.creationRequest).toBe("改成英文的，保留口语感");

    const legacy = RootPreferencesSchema.parse({
      seed: "旧 seed",
      domains: ["AI"],
      tones: ["calm"],
      styles: ["opinion-driven"],
      personas: ["practitioner"]
    });

    expect(legacy.creationRequest).toBe("");
  });

  it("defaults legacy works to social-post and accepts PRD works", () => {
    const legacy = RootPreferencesSchema.parse({
      seed: "旧 seed",
      domains: ["AI"],
      tones: ["calm"],
      styles: ["opinion-driven"],
      personas: ["practitioner"]
    });

    const prd = RootPreferencesSchema.parse({
      artifactTypeId: "prd",
      seed: "移动端草稿管理",
      domains: ["Work"],
      tones: ["calm"],
      styles: ["document"],
      personas: ["product manager"]
    });

    expect(legacy.artifactTypeId).toBe("social-post");
    expect(prd.artifactTypeId).toBe("prd");
  });
});

describe("DirectorOptionsOutputSchema", () => {
  it("accepts a first-round options-only director response", () => {
    const parsed = DirectorOptionsOutputSchema.parse({
      roundIntent: "生成下一步",
      options: [
        { id: "a", label: "补场景", description: "补一个真实场景。", impact: "让内容更具体。", kind: "explore" },
        { id: "b", label: "深挖原因", description: "说清背后的原因。", impact: "让观点更可信。", kind: "deepen" },
        { id: "c", label: "换角度", description: "从反面重看问题。", impact: "让表达更有张力。", kind: "reframe" }
      ]
    });

    expect(parsed.options.map((option) => option.id)).toEqual(["a", "b", "c"]);
    expect(parsed).not.toHaveProperty("draft");
    expect(parsed).not.toHaveProperty("memoryObservation");
  });
});

describe("DirectorNextStepOutputSchema", () => {
  it("accepts a decision to generate a draft without options", () => {
    const parsed = DirectorNextStepOutputSchema.parse({
      action: "draft",
      roundIntent: "信息足够，生成一版 PRD"
    });

    expect(parsed.action).toBe("draft");
    expect(parsed).not.toHaveProperty("options");
    expect(parsed).not.toHaveProperty("memoryObservation");
  });

  it("accepts a decision to complete the current path without more options or a draft", () => {
    const parsed = DirectorNextStepOutputSchema.parse({
      action: "complete",
      roundIntent: "当前版本已经可以交付"
    });

    expect(parsed.action).toBe("complete");
    expect(parsed).not.toHaveProperty("options");
    expect(parsed).not.toHaveProperty("memoryObservation");
  });

  it("accepts a decision to continue with three real choices", () => {
    const parsed = DirectorNextStepOutputSchema.parse({
      action: "options",
      roundIntent: "需要先澄清样式修改范围",
      options: [
        { id: "a", label: "说明页面范围", description: "先确认哪些页面需要改。", impact: "避免草稿假设范围。", kind: "deepen" },
        { id: "b", label: "说明目标风格", description: "先确认要改成什么感觉。", impact: "让后续 PRD 更准确。", kind: "reframe" },
        { id: "c", label: "说明验收标准", description: "先确认怎么判断改好了。", impact: "让需求可执行。", kind: "finish" }
      ]
    });

    expect(parsed.action).toBe("options");
    expect(parsed).not.toHaveProperty("memoryObservation");
    if (parsed.action === "options") {
      expect(parsed.options.map((option) => option.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("normalizes an options decision when the model omits the action field", () => {
    const parsed = DirectorNextStepOutputSchema.parse({
      roundIntent: "需要先澄清样式修改范围",
      options: [
        { id: "a", label: "说明页面范围", description: "先确认哪些页面需要改。", impact: "避免草稿假设范围。", kind: "deepen" },
        { id: "b", label: "说明目标风格", description: "先确认要改成什么感觉。", impact: "让后续 PRD 更准确。", kind: "reframe" },
        { id: "c", label: "说明验收标准", description: "先确认怎么判断改好了。", impact: "让需求可执行。", kind: "finish" }
      ]
    });

    expect(parsed.action).toBe("options");
    expect(parsed).not.toHaveProperty("memoryObservation");
    if (parsed.action === "options") {
      expect(parsed.options).toHaveLength(3);
    }
  });

  it("normalizes director answers that omit branch ids and kinds", () => {
    const parsed = DirectorNextStepOutputSchema.parse({
      action: "options",
      roundIntent: "需要先确认表达角度",
      options: [
        {
          label: "改样式的方法论",
          description: "聚焦我是如何做选择的。",
          impact: "适合技术/设计混合读者。"
        },
        {
          label: "审美迭代过程",
          description: "聚焦我的审美是怎么变的。",
          impact: "适合建立人设和情感连接。"
        },
        {
          label: "组件设计哲学",
          description: "聚焦这个组件为什么长这样。",
          impact: "适合产品/设计视角分析。"
        }
      ]
    });

    expect(parsed.action).toBe("options");
    expect(parsed).not.toHaveProperty("memoryObservation");
    if (parsed.action === "options") {
      expect(parsed.options.map((option) => option.id)).toEqual(["a", "b", "c"]);
      expect(parsed.options.map((option) => option.kind)).toEqual(["explore", "deepen", "reframe"]);
    }
  });
});

describe("DirectorOutputSchema", () => {
  it("accepts a structured AI director response", () => {
    const option = {
      id: "a",
      label: "Turn it into a sharper opinion",
      description: "Make the draft more memorable by adding contrast.",
      impact: "The next draft will emphasize tension.",
      kind: "reframe"
    };

    const parsed = DirectorOutputSchema.parse({
      roundIntent: "Add tension",
      options: [
        option,
        { ...option, id: "b", kind: "deepen" },
        { ...option, id: "c", kind: "finish" }
      ],
      draft: {
        title: "A working title",
        body: "A short body.",
        hashtags: ["#AI"],
        imagePrompt: "A luminous tree on a writing desk."
      },
      finishAvailable: true,
      publishPackage: null
    });

    expect(parsed.options).toHaveLength(3);
    expect(parsed).not.toHaveProperty("memoryObservation");
  });

  it("rejects responses with one option", () => {
    const option = {
      id: "a",
      label: "Only option",
      description: "Missing two choices.",
      impact: "Cannot continue.",
      kind: "explore"
    };

    expect(() =>
      DirectorOutputSchema.parse({
        roundIntent: "Add tension",
        options: [option],
        draft: {
          title: "",
          body: "",
          hashtags: [],
          imagePrompt: ""
        },
        finishAvailable: false,
        publishPackage: null
      })
    ).toThrow("AI suggestions must include exactly three items.");
  });

  it("rejects responses with four options", () => {
    const option = {
      id: "a",
      label: "Turn it into a sharper opinion",
      description: "Make the draft more memorable by adding contrast.",
      impact: "The next draft will emphasize tension.",
      kind: "reframe"
    };

    expect(() =>
      DirectorOutputSchema.parse({
        roundIntent: "Add tension",
        options: [
          option,
          { ...option, id: "b", kind: "deepen" },
          { ...option, id: "c", kind: "finish" },
          { ...option, id: "a", label: "Try another angle" }
        ],
        draft: {
          title: "",
          body: "",
          hashtags: [],
          imagePrompt: ""
        },
        finishAvailable: false,
        publishPackage: null
      })
    ).toThrow("AI suggestions must include exactly three items.");
  });

  it("rejects duplicate option IDs", () => {
    const option = {
      id: "a",
      label: "Turn it into a sharper opinion",
      description: "Make the draft more memorable by adding contrast.",
      impact: "The next draft will emphasize tension.",
      kind: "reframe"
    };

    expect(() =>
      DirectorOutputSchema.parse({
        roundIntent: "Add tension",
        options: [
          option,
          { ...option, label: "Deepen the proof" },
          { ...option, label: "Try another angle" }
        ],
        draft: {
          title: "",
          body: "",
          hashtags: [],
          imagePrompt: ""
        },
        finishAvailable: false,
        publishPackage: null
      })
    ).toThrow("AI suggestions must include IDs a, b, and c exactly once.");
  });

  it("keeps custom branches out of AI director responses", () => {
    const option = {
      id: "a",
      label: "Turn it into a sharper opinion",
      description: "Make the draft more memorable by adding contrast.",
      impact: "The next draft will emphasize tension.",
      kind: "reframe"
    };

    expect(() =>
      DirectorOutputSchema.parse({
        roundIntent: "Add tension",
        options: [
          option,
          { ...option, id: "b", kind: "deepen" },
          { ...option, id: "custom-user", label: "User custom branch" }
        ],
        draft: {
          title: "",
          body: "",
          hashtags: [],
          imagePrompt: ""
        },
        finishAvailable: false,
        publishPackage: null
      })
    ).toThrow("AI suggestions must include IDs a, b, and c exactly once.");
  });
});

describe("requireThreeOptions", () => {
  it("rejects outputs that do not include exactly three choices", () => {
    const option = BranchOptionSchema.parse({
      id: "a",
      label: "Only option",
      description: "Missing two choices.",
      impact: "Cannot continue.",
      kind: "explore"
    });

    expect(() => requireThreeOptions([option])).toThrow("AI suggestions must include exactly three items.");
  });
});

describe("SkillSchema", () => {
  it("accepts a reusable prompt skill", () => {
    const parsed = SkillSchema.parse({
      id: "skill-analysis",
      title: "分析",
      category: "方向",
      description: "拆解问题、结构和可写角度。",
      prompt: "先分析写作动机、读者和表达目标。",
      isSystem: true,
      defaultEnabled: true,
      isArchived: false,
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z"
    });

    expect(parsed.title).toBe("分析");
    expect(parsed.defaultEnabled).toBe(true);
  });

  it("rejects oversized skill prompts", () => {
    expect(() =>
      SkillUpsertSchema.parse({
        title: "长提示词",
        category: "约束",
        description: "过长输入。",
        prompt: "太长".repeat(60000)
      })
    ).toThrow();
  });

  it("accepts long generic SKILL.md prompts", () => {
    const parsed = SkillUpsertSchema.parse({
      title: "xhs-publish",
      category: "平台",
      description: "导入的小红书发布技能。",
      prompt: "发布前确认。\n".repeat(3000),
      appliesTo: "both"
    });

    expect(parsed.prompt.length).toBeGreaterThan(20000);
  });

  it("accepts skill applicability and defaults custom skills to shared constraints", () => {
    expect(
      SkillUpsertSchema.parse({
        title: "逻辑链审查",
        category: "检查",
        description: "检查论证跳跃。",
        prompt: "检查因果链是否成立。",
        appliesTo: "editor"
      })
    ).toMatchObject({
      appliesTo: "editor",
      defaultEnabled: false,
      isArchived: false
    });

    expect(
      SkillUpsertSchema.parse({
        title: "保留原意",
        category: "约束",
        description: "不改掉用户原来的判断。",
        prompt: "保留用户原意。"
      }).appliesTo
    ).toBe("both");
  });

  it("rejects invalid skill applicability", () => {
    expect(() =>
      SkillUpsertSchema.parse({
        title: "错误技能",
        category: "检查",
        description: "",
        prompt: "检查。",
        appliesTo: "review"
      })
    ).toThrow();
  });

  it("routes skills by runtime target", () => {
    const writerSkill = SkillSchema.parse({
      id: "writer",
      title: "自然短句",
      category: "风格",
      description: "让草稿更自然。",
      prompt: "句子短一点。",
      appliesTo: "writer",
      isSystem: false,
      defaultEnabled: false,
      isArchived: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    });
    const editorSkill = SkillSchema.parse({
      ...writerSkill,
      id: "editor",
      title: "逻辑链审查",
      appliesTo: "editor"
    });
    const sharedSkill = SkillSchema.parse({
      ...writerSkill,
      id: "shared",
      title: "标题不要夸张",
      appliesTo: "both"
    });

    expect(skillsForTarget([writerSkill, editorSkill, sharedSkill], "writer").map((skill) => skill.id)).toEqual([
      "writer",
      "shared"
    ]);
    expect(skillsForTarget([writerSkill, editorSkill, sharedSkill], "editor").map((skill) => skill.id)).toEqual([
      "editor",
      "shared"
    ]);
  });

  it("assigns the merged system skills to writing and review effect groups", () => {
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-writer")?.appliesTo).toBe("writer");
    expect(DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-reviewer")?.appliesTo).toBe("editor");
  });

  it("ships only the merged writer and reviewer skills as default enabled system skills", () => {
    expect(DEFAULT_SYSTEM_SKILLS.filter((skill) => !skill.isArchived).map((skill) => skill.id)).toEqual([
      "system-writer",
      "system-reviewer"
    ]);
    expect(DEFAULT_SYSTEM_SKILLS.filter((skill) => skill.defaultEnabled).map((skill) => skill.id)).toEqual([
      "system-writer",
      "system-reviewer"
    ]);

    const archivedLegacySkills = DEFAULT_SYSTEM_SKILLS.filter((skill) =>
      [
        "system-content-workflow",
        "system-analysis",
        "system-expand",
        "system-rewrite",
        "system-polish",
        "system-correct",
        "system-style-shift",
        "system-compress",
        "system-restructure",
        "system-audience",
        "system-logic-review",
        "system-reader-entry",
        "system-final-pass",
        "system-concrete-examples",
        "system-no-hype-title",
        "system-claim-risk",
        "system-title-opening-promise",
        "system-natural-short-sentences"
      ].includes(skill.id)
    ).map((skill) => ({ id: skill.id, defaultEnabled: skill.defaultEnabled, isArchived: skill.isArchived }));

    expect(archivedLegacySkills).toHaveLength(18);
    expect(archivedLegacySkills).toEqual(expect.arrayContaining([
      { id: "system-content-workflow", defaultEnabled: false, isArchived: true },
      { id: "system-analysis", defaultEnabled: false, isArchived: true },
      { id: "system-expand", defaultEnabled: false, isArchived: true },
      { id: "system-rewrite", defaultEnabled: false, isArchived: true },
      { id: "system-polish", defaultEnabled: false, isArchived: true },
      { id: "system-correct", defaultEnabled: false, isArchived: true },
      { id: "system-style-shift", defaultEnabled: false, isArchived: true },
      { id: "system-compress", defaultEnabled: false, isArchived: true },
      { id: "system-restructure", defaultEnabled: false, isArchived: true },
      { id: "system-audience", defaultEnabled: false, isArchived: true },
      { id: "system-logic-review", defaultEnabled: false, isArchived: true },
      { id: "system-reader-entry", defaultEnabled: false, isArchived: true },
      { id: "system-final-pass", defaultEnabled: false, isArchived: true },
      { id: "system-concrete-examples", defaultEnabled: false, isArchived: true },
      { id: "system-no-hype-title", defaultEnabled: false, isArchived: true },
      { id: "system-claim-risk", defaultEnabled: false, isArchived: true },
      { id: "system-title-opening-promise", defaultEnabled: false, isArchived: true },
      { id: "system-natural-short-sentences", defaultEnabled: false, isArchived: true }
    ]));
  });

  it("keeps merged system prompts as creator decision guidance", () => {
    const writer = DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-writer");
    const reviewer = DEFAULT_SYSTEM_SKILLS.find((skill) => skill.id === "system-reviewer");

    expect(writer?.prompt).toContain("写作者");
    expect(writer?.prompt).toContain("种子或零散想法");
    expect(writer?.prompt).toContain("组织材料");
    expect(writer?.prompt).toContain("自然、清楚");
    expect(writer?.prompt).toContain("保留用户已经确认过的表达");

    expect(reviewer?.prompt).toContain("审核者");
    expect(reviewer?.prompt).toContain("一个问题和三个答案");
    expect(reviewer?.prompt).toContain("主线");
    expect(reviewer?.prompt).toContain("读者");
    expect(reviewer?.prompt).toContain("逻辑断点");
    expect(reviewer?.prompt).toContain("发布前");
  });

  it("keeps every default system skill valid for runtime parsing", () => {
    DEFAULT_SYSTEM_SKILLS.forEach((skill) => {
      expect(() => SkillUpsertSchema.parse(skill)).not.toThrow();
    });
  });
});

describe("SessionStateSchema", () => {
  it("accepts a user-authored custom branch in the runtime tree", () => {
    const option = BranchOptionSchema.parse({
      id: "custom-user",
      label: "自定义方向",
      description: "用户临时补充的方向。",
      impact: "按用户自定义方向继续。",
      kind: "reframe"
    });

    expect(option.id).toBe("custom-user");
  });

  it("accepts the runtime session tree shape", () => {
    const option = BranchOptionSchema.parse({
      id: "a",
      label: "Explore",
      description: "Open a fresh direction.",
      impact: "The next draft will add range.",
      kind: "explore"
    });

    const node = {
      id: "node-1",
      sessionId: "session-1",
      parentId: null,
      roundIndex: 0,
      roundIntent: "Start",
      options: [option],
      selectedOptionId: null,
      foldedOptions: [],
      agentMessages: [],
      createdAt: "2026-04-24T00:00:00.000Z"
    };

    const parsed = SessionStateSchema.parse({
      rootMemory: {
        id: "root-1",
        preferences: {
          domains: ["AI"],
          tones: ["calm"],
          styles: ["opinion-driven"],
          personas: ["practitioner"]
        },
        summary: "",
        learnedSummary: "",
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z"
      },
      session: {
        artifactTypeId: "prd",
        id: "session-1",
        title: "Treeable session",
        status: "active",
        currentNodeId: "node-1",
        createdAt: "2026-04-24T00:00:00.000Z",
        updatedAt: "2026-04-24T00:00:00.000Z"
      },
      currentNode: node,
      currentDraft: {
        title: "",
        body: "",
        hashtags: [],
        imagePrompt: ""
      },
      selectedPath: [node],
      enabledSkillIds: ["skill-analysis"],
      enabledSkills: [
        {
          id: "skill-analysis",
          title: "分析",
          category: "方向",
          description: "拆解问题、结构和可写角度。",
          prompt: "先分析写作动机、读者和表达目标。",
          isSystem: true,
          defaultEnabled: true,
          isArchived: false,
          createdAt: "2026-04-26T00:00:00.000Z",
          updatedAt: "2026-04-26T00:00:00.000Z"
        }
      ],
      foldedBranches: [
        {
          id: "fold-1",
          nodeId: "node-1",
          option,
          createdAt: "2026-04-24T00:00:00.000Z"
        }
      ],
      publishPackage: null
    });

    expect(parsed.session.status).toBe("active");
    expect(parsed.session.artifactTypeId).toBe("prd");
  });
});
