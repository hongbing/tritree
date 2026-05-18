import { describe, expect, it } from "vitest";
import { prdPlugin } from "@/artifacts/plugins/prd/server";

describe("prdPlugin", () => {
  it("uses markdown instead of social-post fields", () => {
    const payload = prdPlugin.normalizeAiOutput({ title: "登录改版 PRD", markdown: "## 背景\n用户登录慢。" });

    expect(payload).toEqual({ title: "登录改版 PRD", markdown: "## 背景\n用户登录慢。" });
    expect(prdPlugin.summarizeForDirector(payload)).toContain("PRD Markdown");
  });
});
