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
  "system-publisher",
  "system-planner",
  "system-researcher",
  "system-reviewer",
  "system-writer"
];
const roleSectionPhrases = ["角色职责", "有用输出", "适合委托", "调用前最小上下文"];
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

    expect(defaults.systemSkills.map((skill) => skill.id).sort()).toEqual(defaultSystemSkillIds.toSorted());
    expect(defaults.systemSkills).toHaveLength(defaultSystemSkillIds.length);
    expect(systemSkillsById.get("system-planner")?.title).toBe("策划");
    expect(systemSkillsById.get("system-researcher")?.title).toBe("资料员");
    expect(systemSkillsById.get("system-writer")?.title).toBe("写手");
    expect(systemSkillsById.get("system-reviewer")?.title).toBe("审稿");
    expect(systemSkillsById.get("system-publisher")?.title).toBe("发布编辑");

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
      for (const phrase of protocolPhrases) {
        expect(skill?.prompt).not.toContain(phrase);
      }
    }
  });
});
