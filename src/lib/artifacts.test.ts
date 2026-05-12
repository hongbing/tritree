import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARTIFACT_TYPE_ID,
  buildArtifactDelivery,
  formatArtifactInstructionsForDirector,
  getArtifactType,
  listArtifactTypes
} from "./artifacts";

describe("artifact type registry", () => {
  it("registers social posts as the default artifact type and PRD as a work document type", () => {
    expect(DEFAULT_ARTIFACT_TYPE_ID).toBe("social-post");
    expect(listArtifactTypes().map((artifactType) => artifactType.id)).toEqual(["social-post", "prd"]);
    expect(getArtifactType("social-post").label).toBe("社媒内容");
    expect(getArtifactType("prd").label).toBe("PRD 文档");
  });

  it("formats PRD-specific director instructions", () => {
    const instructions = formatArtifactInstructionsForDirector("prd");

    expect(instructions).toContain("作品类型：PRD 文档");
    expect(instructions).toContain("背景");
    expect(instructions).toContain("目标");
    expect(instructions).toContain("非目标");
    expect(instructions).toContain("需求");
    expect(instructions).toContain("hashtags 必须返回空数组");
  });

  it("builds PRD delivery markdown and section checks", () => {
    const delivery = buildArtifactDelivery("prd", {
      title: "移动端草稿管理 PRD",
      body: ["## 背景", "用户需要移动端继续草稿。", "## 目标", "降低继续写作成本。", "## 需求", "- 列出草稿"].join("\n"),
      hashtags: ["#不应出现"],
      imagePrompt: "不应出现"
    });

    expect(delivery.title).toBe("PRD 交付稿");
    expect(delivery.copyLabel).toBe("复制 PRD Markdown");
    expect(delivery.text).toContain("# 移动端草稿管理 PRD");
    expect(delivery.text).toContain("## 背景");
    expect(delivery.text).not.toContain("#不应出现");
    expect(delivery.checks).toContainEqual({ text: "已包含：背景", tone: "ok" });
    expect(delivery.checks).toContainEqual({ text: "缺少：非目标", tone: "warn" });
  });
});
