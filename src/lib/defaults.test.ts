import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULTS_CONFIG_PATH_ENV,
  defaultDefaultsConfigPath,
  loadConfiguredDefaults,
  resolveDefaultsConfigPath
} from "./defaults";

const exampleDefaultsConfigPath = path.resolve("config/defaults.example.json");
const defaultSystemSkillIds = [
  "system-creator",
  "system-planner",
  "system-researcher",
  "system-writer",
  "system-reviewer",
  "system-publisher"
];
const defaultLoadedSystemSkillIds = ["system-creator"];
const creatorChildSkillIds = [
  "system-planner",
  "system-researcher",
  "system-writer",
  "system-reviewer",
  "system-publisher"
];
const roleSectionPhrases = ["角色职责", "有用输出", "调用前最小上下文"];
const protocolPhrases = ["roundIntent", "options[]", "三个答案", "让用户选择"];

const validConfig = JSON.stringify({
  systemSkills: [
    {
      id: "system-writer",
      title: "系统写作者",
      category: "风格",
      description: "负责生成草稿。",
      prompt: "写出下一版草稿。",
      appliesTo: "writer",
      defaultEnabled: true,
      isArchived: false
    }
  ],
  creationRequestOptions: [
    { id: "default-preserve-my-meaning", label: "  保留我的原意  " },
    { id: "default-short-version", label: "先给短版", sortOrder: 1 }
  ],
  inspirations: [
    {
      id: "idea-1",
      title: "  AI 产品真实困境  ",
      detail: "  写 AI 产品经理的真实困境。  ",
      artifactTypeIds: ["social-post"]
    }
  ]
});

describe("defaults config loader", () => {
  it("resolves the default config path under .tritree", () => {
    expect(defaultDefaultsConfigPath("/workspace/tritree")).toBe(
      path.join("/workspace/tritree", ".tritree", "defaults.json")
    );
    expect(resolveDefaultsConfigPath({ cwd: "/workspace/tritree", env: {} })).toBe(
      path.join("/workspace/tritree", ".tritree", "defaults.json")
    );
  });

  it("uses an absolute TRITREE_DEFAULTS_CONFIG_PATH override", () => {
    expect(
      resolveDefaultsConfigPath({
        cwd: "/workspace/tritree",
        env: { [DEFAULTS_CONFIG_PATH_ENV]: "/secure/defaults.json" }
      })
    ).toBe("/secure/defaults.json");
  });

  it("rejects relative TRITREE_DEFAULTS_CONFIG_PATH values", () => {
    expect(() =>
      resolveDefaultsConfigPath({
        cwd: "/workspace/tritree",
        env: { [DEFAULTS_CONFIG_PATH_ENV]: "config/defaults.json" }
      })
    ).toThrow("TRITREE_DEFAULTS_CONFIG_PATH must be an absolute path");
  });

  it("rejects a missing config file", () => {
    expect(() =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => false
      })
    ).toThrow("Defaults config /workspace/tritree/.tritree/defaults.json was not found");
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => true,
        readFile: () => "{ invalid json"
      })
    ).toThrow("is not valid JSON");
  });

  it("requires system skills, creation request options, and inspirations fields", () => {
    expect(() =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => true,
        readFile: () => JSON.stringify({})
      })
    ).toThrow("systemSkills");

    expect(() =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => true,
        readFile: () => JSON.stringify({ systemSkills: [], creationRequestOptions: [], inspirations: [] })
      })
    ).toThrow("systemSkills must be a non-empty array");
  });

  it("rejects duplicate ids within each defaults section", () => {
    const duplicateSkill = () =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => true,
        readFile: () =>
          JSON.stringify({
            systemSkills: [
              {
                id: "system-writer",
                title: "系统写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer"
              },
              {
                id: "system-writer",
                title: "重复写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer"
              }
            ],
            creationRequestOptions: [],
            inspirations: []
          })
      });

    expect(duplicateSkill).toThrow("Duplicate systemSkills id: system-writer");

    const duplicateRequest = () =>
      loadConfiguredDefaults({
        configPath: "/workspace/tritree/.tritree/defaults.json",
        exists: () => true,
        readFile: () =>
          JSON.stringify({
            systemSkills: [
              {
                id: "system-writer",
                title: "系统写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer"
              }
            ],
            creationRequestOptions: [
              { id: "default-preserve-my-meaning", label: "保留我的原意" },
              { id: "default-preserve-my-meaning", label: "重复" }
            ],
            inspirations: []
          })
      });

    expect(duplicateRequest).toThrow("Duplicate creationRequestOptions id: default-preserve-my-meaning");
  });

  it("parses valid defaults through shared schemas", () => {
    const defaults = loadConfiguredDefaults({
      configPath: "/workspace/tritree/.tritree/defaults.json",
      exists: () => true,
      readFile: () => validConfig
    });

    expect(defaults.systemSkills).toEqual([
      expect.objectContaining({
        id: "system-writer",
        appliesTo: "writer",
        defaultEnabled: true,
        isArchived: false
      })
    ]);
    expect(defaults.creationRequestOptions).toEqual([
      { id: "default-preserve-my-meaning", label: "保留我的原意" },
      { id: "default-short-version", label: "先给短版", sortOrder: 1 }
    ]);
    expect(defaults.inspirations).toEqual([
      {
        id: "idea-1",
        title: "AI 产品真实困境",
        detail: "写 AI 产品经理的真实困境。",
        artifactTypeIds: ["social-post"]
      }
    ]);
  });

  it("keeps the example defaults as role-focused default-enabled system skills", () => {
    const defaults = loadConfiguredDefaults({
      configPath: exampleDefaultsConfigPath,
      exists: () => true,
      readFile: (filePath) => readFileSync(filePath, "utf8")
    });

    const systemSkillsById = new Map(defaults.systemSkills.map((skill) => [skill.id, skill]));

    expect(defaults.systemSkills.map((skill) => skill.id)).toEqual(defaultSystemSkillIds);
    expect(defaults.systemSkills).toHaveLength(defaultSystemSkillIds.length);
    expect(systemSkillsById.get("system-creator")?.title).toBe("创作者");
    expect(systemSkillsById.get("system-planner")?.title).toBe("策划");
    expect(systemSkillsById.get("system-researcher")?.title).toBe("资料员");
    expect(systemSkillsById.get("system-writer")?.title).toBe("写手");
    expect(systemSkillsById.get("system-reviewer")?.title).toBe("审稿");
    expect(systemSkillsById.get("system-publisher")?.title).toBe("发布编辑");
    expect(systemSkillsById.get("system-creator")?.defaultLoaded).toBe(true);
    expect(systemSkillsById.get("system-creator")?.parentSkillId).toBeNull();
    expect(defaults.systemSkills.filter((skill) => skill.defaultLoaded).map((skill) => skill.id)).toEqual(
      defaultLoadedSystemSkillIds
    );
    for (const skillId of creatorChildSkillIds) {
      expect(systemSkillsById.get(skillId)?.parentSkillId).toBe("system-creator");
      expect(systemSkillsById.get(skillId)?.defaultLoaded).toBe(false);
    }
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("创作流程总览");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("先判断当前最值得推进的是方向、资料、成稿、审稿还是发布收口");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("方向不清时用策划");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("需要事实、例子或来源时用资料员");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("需要正文产出或改写时用写手");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("需要质量判断时用审稿");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("接近交付时用发布编辑");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("先调用 load_skill");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("load_skill(system-writer)");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("不要只凭总览模拟子 skill");
    expect(systemSkillsById.get("system-creator")?.prompt).toContain("用户可见输出必须落到本轮目标产物");
    expect(systemSkillsById.get("system-planner")?.prompt).toContain("内容创作通常会在策划、资料、写作、审稿和发布编辑之间往复");
    expect(systemSkillsById.get("system-planner")?.prompt).toContain("已经生成草稿后，也可以回到找资料");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("material-search");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("补资料、搜参考、找素材、补充证据、核查事实或寻找来源");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("优先主动使用可用搜索、检索、MCP 或资料型能力获取或核验外部材料");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("交叉验证");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("不得编造来源、数字、人物话语或时间线");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("无法核验时标注待确认");
    expect(systemSkillsById.get("system-researcher")?.prompt).toContain("关键材料转成用户可见摘要");
    expect(systemSkillsById.get("system-writer")?.prompt).toContain("若作品类型需要标题、话题或配图提示");
    expect(systemSkillsById.get("system-publisher")?.prompt).not.toContain("platform-rewrite");
    for (const skill of defaults.systemSkills) {
      expect(skill.prompt).not.toContain("适合委托");
    }
    expect(defaults.systemSkills.filter((skill) => skill.defaultEnabled).map((skill) => skill.id)).toEqual(defaultSystemSkillIds);
    expect(defaults.systemSkills.map((skill) => skill.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);

    for (const skillId of defaultSystemSkillIds) {
      const skill = systemSkillsById.get(skillId);
      expect(skill).toEqual(expect.objectContaining({
        category: "content-team",
        appliesTo: "both",
        defaultEnabled: true,
        isArchived: false
      }));
      for (const phrase of roleSectionPhrases) {
        expect(skill?.prompt).toContain(phrase);
      }
      expect(skill?.prompt).toMatch(/适合(加载|使用)/);
      for (const phrase of protocolPhrases) {
        expect(skill?.prompt).not.toContain(phrase);
      }
    }
  });
});
