import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  InspirationProviderError,
  externalInspirationProviderAvailable,
  fetchExternalInspirations
} from "./inspirations";
import { DEFAULTS_CONFIG_PATH_ENV, type ConfiguredDefaults } from "./defaults";

const defaultSystemSkills: ConfiguredDefaults["systemSkills"] = [
  {
    id: "system-writer",
    title: "系统写作者",
    category: "风格",
    description: "负责生成草稿。",
    prompt: "写出下一版草稿。",
    appliesTo: "writer",
    sortOrder: 0,
    defaultEnabled: true,
    isArchived: false
  }
];

function writeDefaultsConfig(inspirations: ConfiguredDefaults["inspirations"]) {
  const root = mkdtempSync(path.join(tmpdir(), "tritree-default-inspirations-"));
  const configPath = path.join(root, "defaults.json");
  writeFileSync(
    configPath,
    JSON.stringify({ systemSkills: defaultSystemSkills, creationRequestOptions: [], inspirations }, null, 2)
  );
  return configPath;
}

describe("inspiration helpers", () => {
  it("detects external provider availability from URL configuration", () => {
    expect(externalInspirationProviderAvailable({})).toBe(false);
    expect(externalInspirationProviderAvailable({ TRITREE_INSPIRATION_URL: "   " })).toBe(false);
    expect(externalInspirationProviderAvailable({ TRITREE_INSPIRATION_URL: "https://ideas.example/list" })).toBe(true);
  });
});

describe("fetchExternalInspirations", () => {
  it("returns configured default inspirations without calling fetch when the provider URL is missing", async () => {
    const fetchMock = vi.fn();
    const configPath = writeDefaultsConfig([
      {
        id: "idea-social",
        title: "社媒灵感",
        detail: "写一条社媒内容。",
        artifactTypeIds: ["social-post"]
      },
      {
        id: "idea-prd",
        title: "PRD 灵感",
        detail: "写一份 PRD。",
        artifactTypeIds: ["prd"]
      }
    ]);

    const inspirations = await fetchExternalInspirations({
      env: { [DEFAULTS_CONFIG_PATH_ENV]: configPath },
      fetchImpl: fetchMock
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(inspirations.map((inspiration) => inspiration.title)).toEqual(["社媒灵感", "PRD 灵感"]);
  });

  it("filters configured default inspirations by artifact type", async () => {
    const configPath = writeDefaultsConfig([
      {
        id: "idea-social",
        title: "社媒灵感",
        detail: "写一条社媒内容。",
        artifactTypeIds: ["social-post"]
      },
      {
        id: "idea-prd",
        title: "PRD 灵感",
        detail: "写一份 PRD。",
        artifactTypeIds: ["prd"]
      }
    ]);

    const inspirations = await fetchExternalInspirations({
      env: { [DEFAULTS_CONFIG_PATH_ENV]: configPath },
      artifactTypeId: "prd",
      fetchImpl: vi.fn()
    });

    expect(inspirations.map((inspiration) => inspiration.title)).toEqual(["PRD 灵感"]);
  });

  it("calls the configured provider and normalizes inspiration items", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        inspirations: [
          {
            id: " idea-1 ",
            title: "  AI 产品真实困境  ",
            detail: "  我想写 AI 产品经理在真实项目里的困境。  ",
            artifactTypeId: "social-post",
            extra: "ignored"
          },
          { id: "idea-prd", title: "PRD 取舍", detail: "写一个 PRD 取舍。", artifactTypeIds: ["prd"] },
          { id: "missing-detail", title: "不完整", detail: "   " },
          { id: 12, title: "错误类型", detail: "不会出现" }
        ]
      })
    });

    const inspirations = await fetchExternalInspirations({
      env: {
        TRITREE_INSPIRATION_URL: "https://ideas.example/list",
        TRITREE_INSPIRATION_TOKEN: "secret-token"
      },
      artifactTypeId: "social-post",
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ideas.example/list?artifactTypeId=social-post",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer secret-token"
        })
      })
    );
    expect(inspirations).toEqual([
      {
        id: "idea-1",
        title: "AI 产品真实困境",
        detail: "我想写 AI 产品经理在真实项目里的困境。",
        artifactTypeId: "social-post"
      }
    ]);
  });

  it("normalizes invalid provider envelopes into inspiration provider errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ inspirations: null })
    });

    await expect(
      fetchExternalInspirations({
        env: { TRITREE_INSPIRATION_URL: "https://ideas.example/list" },
        fetchImpl: fetchMock
      })
    ).rejects.toMatchObject({
      message: "灵感接口返回格式不完整。",
      status: 502
    });
  });

  it("does not include raw provider failure text in public errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "stacktrace token=secret-provider-key"
    });

    let error: unknown;
    try {
      await fetchExternalInspirations({
        env: { TRITREE_INSPIRATION_URL: "https://ideas.example/list" },
        fetchImpl: fetchMock
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(InspirationProviderError);
    expect(error).toMatchObject({
      message: "灵感接口暂时不可用。",
      status: 502
    });
    expect(error).not.toMatchObject({
      message: expect.stringContaining("stacktrace")
    });
    expect(error).not.toMatchObject({
      message: expect.stringContaining("secret-provider-key")
    });
  });
});
