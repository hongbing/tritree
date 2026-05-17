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
});
