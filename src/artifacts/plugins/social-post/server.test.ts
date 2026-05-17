import { describe, expect, it } from "vitest";
import { socialPostPlugin } from "@/artifacts/plugins/social-post/server";

describe("socialPostPlugin", () => {
  it("owns the current social post payload shape", () => {
    const payload = socialPostPlugin.normalizeAiOutput({
      title: "标题",
      body: "正文",
      hashtags: ["#AI"],
      imagePrompt: "白板"
    });

    expect(payload.body).toBe("正文");
    expect(socialPostPlugin.summarizeForDirector(payload)).toContain("正文：正文");
  });

  it("rewrites a selected body passage into a new social post payload", async () => {
    const result = await socialPostPlugin.handleAction?.({
      artifact: {
        id: "artifact-1",
        type: "social-post",
        version: 1,
        payload: {
          title: "标题",
          body: "第一句。第二句要改。",
          hashtags: ["#AI"],
          imagePrompt: "白板"
        },
        sourceArtifactIds: [],
        createdByNodeId: "node-1",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z"
      },
      input: {
        field: "body",
        selectedText: "第二句要改。",
        replacementText: "第二句已经更清楚。"
      },
      sessionState: {} as never
    });

    expect(result).toEqual({
      payload: {
        title: "标题",
        body: "第一句。第二句已经更清楚。",
        hashtags: ["#AI"],
        imagePrompt: "白板"
      },
      sourceArtifactIds: ["artifact-1"]
    });
  });
});
