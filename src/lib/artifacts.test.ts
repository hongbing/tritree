import { describe, expect, it } from "vitest";
import {
  ARTIFACT_TYPES_ENV,
  DEFAULT_ARTIFACT_TYPE_ID,
  PUBLISH_PLATFORMS_ENV,
  buildArtifactDelivery,
  formatArtifactInstructionsForDirector,
  getArtifactType,
  listConfiguredArtifactTypes,
  listConfiguredPublishPlatforms,
  listArtifactTypes
} from "./artifacts";

describe("artifact type registry", () => {
  it("registers social posts as the default artifact type and PRD as a work document type", () => {
    expect(DEFAULT_ARTIFACT_TYPE_ID).toBe("social-post");
    expect(listArtifactTypes().map((artifactType) => artifactType.id)).toEqual(["social-post", "prd"]);
    expect(getArtifactType("social-post").label).toBe("社媒内容");
    expect(getArtifactType("prd").label).toBe("PRD 文档");
  });

  it("filters enabled artifact types from environment configuration", () => {
    expect(listConfiguredArtifactTypes({}).map((artifactType) => artifactType.id)).toEqual(["social-post", "prd"]);
    expect(listConfiguredArtifactTypes({ [ARTIFACT_TYPES_ENV]: "all" }).map((artifactType) => artifactType.id)).toEqual([
      "social-post",
      "prd"
    ]);
    expect(listConfiguredArtifactTypes({ [ARTIFACT_TYPES_ENV]: "prd" }).map((artifactType) => artifactType.id)).toEqual(["prd"]);
    expect(
      listConfiguredArtifactTypes({ [ARTIFACT_TYPES_ENV]: "prd, social-post, unknown" }).map((artifactType) => artifactType.id)
    ).toEqual(["prd", "social-post"]);
    expect(listConfiguredArtifactTypes({ [ARTIFACT_TYPES_ENV]: "unknown" }).map((artifactType) => artifactType.id)).toEqual([
      "social-post",
      "prd"
    ]);
  });

  it("filters enabled publish platforms from environment configuration", () => {
    expect(listConfiguredPublishPlatforms({})).toEqual(["weibo", "xiaohongshu", "moments"]);
    expect(listConfiguredPublishPlatforms({ [PUBLISH_PLATFORMS_ENV]: "all" })).toEqual(["weibo", "xiaohongshu", "moments"]);
    expect(listConfiguredPublishPlatforms({ [PUBLISH_PLATFORMS_ENV]: "xiaohongshu" })).toEqual(["xiaohongshu"]);
    expect(listConfiguredPublishPlatforms({ [PUBLISH_PLATFORMS_ENV]: "xiaohongshu,moments" })).toEqual(["xiaohongshu", "moments"]);
    expect(listConfiguredPublishPlatforms({ [PUBLISH_PLATFORMS_ENV]: "unknown" })).toEqual(["weibo", "xiaohongshu", "moments"]);
  });

  it("formats PRD-specific director instructions", () => {
    const instructions = formatArtifactInstructionsForDirector("prd");

    expect(instructions).toContain("作品类型：PRD 文档");
    expect(instructions).toContain("背景");
    expect(instructions).toContain("目标");
    expect(instructions).toContain("非目标");
    expect(instructions).toContain("需求");
    expect(instructions).toContain("artifact.type=\"prd\"");
    expect(instructions).toContain("artifact.payload.markdown");
    expect(instructions).not.toContain("draft.");
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
