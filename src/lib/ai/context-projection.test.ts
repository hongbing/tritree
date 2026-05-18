import { describe, expect, it } from "vitest";
import type { Skill } from "@/lib/domain";
import type { DirectorInputParts } from "./prompts";
import {
  SUBAGENT_CONTEXT_POLICY,
  type ContextViewPolicy,
  formatProjectedAgentContext,
  projectAgentContext
} from "./context-projection";

const skill = {
  id: "skill-1",
  title: "审稿",
  category: "检查",
  description: "检查逻辑。",
  prompt: "找出最关键的逻辑断点。",
  appliesTo: "both",
  isSystem: true,
  defaultEnabled: true,
  isArchived: false,
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z"
} satisfies Skill;

function parts(overrides: Partial<DirectorInputParts> = {}): DirectorInputParts {
  return {
    artifactContext: "产物类型：社媒草稿。",
    rootSummary: "Seed：写 AI PM 的真实困境。",
    learnedSummary: "用户喜欢真实、克制的表达。",
    currentArtifact: [
      "标题：最新标题",
      "正文：这是最新 draft 正文。",
      "话题：#AI",
      "配图提示：白板"
    ].join("\n"),
    pathSummary: "第 1 版：旧方向",
    foldedSummary: "",
    selectedOptionLabel: "补论证：增加一个真实冲突。",
    enabledSkills: [skill],
    messages: [
      { role: "assistant", content: "历史草稿正文：这是旧 draft 正文。" },
      { role: "user", content: "用户补充：别写成教程。" }
    ],
    ...overrides
  };
}

describe("projectAgentContext", () => {
  it("projects the latest artifact as the sole artifact body for the default subagent policy", () => {
    const snapshot = projectAgentContext(parts(), SUBAGENT_CONTEXT_POLICY);

    expect(snapshot.currentArtifact).toEqual({
      type: "artifact",
      value: expect.stringContaining("这是最新 draft 正文。")
    });
    expect(snapshot.currentArtifact?.value).not.toContain("这是旧 draft 正文");
    expect(snapshot.selectedDirection).toBe("补论证：增加一个真实冲突。");
    expect(snapshot.enabledSkills.map((item) => item.title)).toEqual(["审稿"]);
    expect(snapshot.recentUserFeedback).toEqual(["用户补充：别写成教程。"]);
  });

  it("omits the artifact body when artifact projection is disabled", () => {
    const policy = {
      ...SUBAGENT_CONTEXT_POLICY,
      artifacts: { current: "none" }
    } satisfies ContextViewPolicy;

    const snapshot = projectAgentContext(parts(), policy);

    expect(snapshot.currentArtifact).toBeNull();
  });

  it("omits recent user feedback when message projection is disabled", () => {
    const policy = {
      ...SUBAGENT_CONTEXT_POLICY,
      messages: "none"
    } satisfies ContextViewPolicy;

    const snapshot = projectAgentContext(parts(), policy);

    expect(snapshot.recentUserFeedback).toEqual([]);
  });

  it("omits enabled skills when skill projection is disabled", () => {
    const policy = {
      ...SUBAGENT_CONTEXT_POLICY,
      skills: "none"
    } satisfies ContextViewPolicy;

    const snapshot = projectAgentContext(parts(), policy);

    expect(snapshot.enabledSkills).toEqual([]);
  });

  it("includes only string user messages as recent feedback under the recent message policy", () => {
    const snapshot = projectAgentContext(
      parts({
        messages: [
          { role: "user", content: "用户反馈：保留冲突。" },
          { role: "user", content: { text: "结构化用户反馈暂不投影。" } },
          { role: "assistant", content: "助手内容不投影。" },
          { role: "user", content: ["数组用户反馈暂不投影。"] }
        ]
      }),
      SUBAGENT_CONTEXT_POLICY
    );

    expect(snapshot.recentUserFeedback).toEqual(["用户反馈：保留冲突。"]);
  });

  it("formats projected context with stable section labels", () => {
    const text = formatProjectedAgentContext(projectAgentContext(parts(), SUBAGENT_CONTEXT_POLICY));

    expect(text).toContain("# Scoped Working Context");
    expect(text).toContain("## Current Artifact");
    expect(text).toContain("type: artifact");
    expect(text).toContain("这是最新 draft 正文");
    expect(text).toContain("## Recent User Feedback");
    expect(text).toContain("用户补充：别写成教程。");
    expect(text).not.toContain("这是旧 draft 正文");
  });
});
