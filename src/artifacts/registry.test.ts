import { describe, expect, it } from "vitest";
import type { ArtifactPluginServer } from "@/artifacts/types";
import { buildArtifactRegistry, getArtifactPlugin, listArtifactPlugins, validateArtifactPayload } from "@/artifacts/registry";
import { socialPostPlugin } from "@/artifacts/plugins/social-post/server";

describe("artifact plugin registry", () => {
  it("loads social-post and prd as plugins", () => {
    expect(listArtifactPlugins().map((plugin) => plugin.id)).toEqual(["social-post", "prd"]);
    expect(getArtifactPlugin("social-post")?.label).toBe("社媒内容");
    expect(getArtifactPlugin("prd")?.label).toBe("PRD 文档");
  });

  it("validates payloads with the owning plugin", () => {
    expect(validateArtifactPayload("social-post", { title: "T", body: "B", hashtags: [], imagePrompt: "" })).toEqual({
      title: "T",
      body: "B",
      hashtags: [],
      imagePrompt: ""
    });
    expect(() => validateArtifactPayload("prd", { title: "T", body: "B" })).toThrow("Invalid artifact payload");
  });

  it("rejects duplicate plugin ids while building a registry", () => {
    expect(() => buildArtifactRegistry([socialPostPlugin, socialPostPlugin])).toThrow(
      "Duplicate artifact plugin id: social-post"
    );
  });

  it("returns a plugin list copy so callers cannot mutate bundled state", () => {
    const plugins = listArtifactPlugins() as ArtifactPluginServer<unknown, unknown>[];
    plugins.push(socialPostPlugin);

    expect(listArtifactPlugins().map((plugin) => plugin.id)).toEqual(["social-post", "prd"]);
  });
});
