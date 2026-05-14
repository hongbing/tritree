import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_SKILLS_CONFIG_PATH_ENV,
  defaultSystemSkillsConfigPath,
  loadConfiguredSystemSkills,
  resolveSystemSkillsConfigPath
} from "./system-skills";

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
    },
    {
      id: "system-reviewer",
      title: "系统审核者",
      category: "检查",
      description: "负责提出下一步问题。",
      prompt: "提出一个问题和三个答案。",
      appliesTo: "editor",
      defaultEnabled: true,
      isArchived: false
    }
  ]
});

describe("system skill config loader", () => {
  it("resolves the default system skills config path under .tritree", () => {
    expect(defaultSystemSkillsConfigPath("/workspace/tritree")).toBe(
      path.join("/workspace/tritree", ".tritree", "system-skills.json")
    );
    expect(resolveSystemSkillsConfigPath({ cwd: "/workspace/tritree", env: {} })).toBe(
      path.join("/workspace/tritree", ".tritree", "system-skills.json")
    );
  });

  it("uses an absolute TRITREE_SYSTEM_SKILLS_CONFIG_PATH override", () => {
    expect(
      resolveSystemSkillsConfigPath({
        cwd: "/workspace/tritree",
        env: { [SYSTEM_SKILLS_CONFIG_PATH_ENV]: "/secure/system-skills.json" }
      })
    ).toBe("/secure/system-skills.json");
  });

  it("rejects relative TRITREE_SYSTEM_SKILLS_CONFIG_PATH values", () => {
    expect(() =>
      resolveSystemSkillsConfigPath({
        cwd: "/workspace/tritree",
        env: { [SYSTEM_SKILLS_CONFIG_PATH_ENV]: "config/system-skills.json" }
      })
    ).toThrow("TRITREE_SYSTEM_SKILLS_CONFIG_PATH must be an absolute path");
  });

  it("rejects a missing config file", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => false
      })
    ).toThrow("System skills config /workspace/tritree/.tritree/system-skills.json was not found");
  });

  it("rejects invalid JSON without printing prompt content", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => "{ invalid json"
      })
    ).toThrow("is not valid JSON");
  });

  it("requires a non-empty systemSkills array", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => JSON.stringify({})
      })
    ).toThrow("systemSkills must be a non-empty array");

    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
        exists: () => true,
        readFile: () => JSON.stringify({ systemSkills: [] })
      })
    ).toThrow("systemSkills must be a non-empty array");
  });

  it("rejects duplicate system skill ids", () => {
    expect(() =>
      loadConfiguredSystemSkills({
        configPath: "/workspace/tritree/.tritree/system-skills.json",
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
                appliesTo: "writer",
                defaultEnabled: true,
                isArchived: false
              },
              {
                id: "system-writer",
                title: "重复写作者",
                category: "风格",
                description: "",
                prompt: "写作。",
                appliesTo: "writer",
                defaultEnabled: true,
                isArchived: false
              }
            ]
          })
      })
    ).toThrow("Duplicate system skill id: system-writer");
  });

  it("parses valid skills through SkillUpsertSchema defaults and validation", () => {
    const skills = loadConfiguredSystemSkills({
      configPath: "/workspace/tritree/.tritree/system-skills.json",
      exists: () => true,
      readFile: () => validConfig
    });

    expect(skills).toEqual([
      expect.objectContaining({
        id: "system-writer",
        appliesTo: "writer",
        defaultEnabled: true,
        isArchived: false
      }),
      expect.objectContaining({
        id: "system-reviewer",
        appliesTo: "editor",
        defaultEnabled: true,
        isArchived: false
      })
    ]);
  });
});
