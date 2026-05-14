import { describe, expect, it, vi } from "vitest";
import {
  ExternalInspirationProviderUnavailableError,
  MOCK_INSPIRATIONS_ENV,
  InspirationProviderError,
  externalInspirationProviderAvailable,
  fetchExternalInspirations
} from "./inspirations";

describe("inspiration helpers", () => {
  it("detects external provider availability from URL configuration", () => {
    expect(externalInspirationProviderAvailable({})).toBe(false);
    expect(externalInspirationProviderAvailable({ TRITREE_INSPIRATION_URL: "   " })).toBe(false);
    expect(externalInspirationProviderAvailable({ [MOCK_INSPIRATIONS_ENV]: "1" })).toBe(true);
    expect(externalInspirationProviderAvailable({ TRITREE_INSPIRATION_URL: "https://ideas.example/list" })).toBe(true);
  });
});

describe("fetchExternalInspirations", () => {
  it("throws unavailable when the provider URL is missing", async () => {
    await expect(fetchExternalInspirations({ env: {} })).rejects.toBeInstanceOf(
      ExternalInspirationProviderUnavailableError
    );
  });

  it("returns mock inspirations without calling fetch when local debug mode is enabled", async () => {
    const fetchMock = vi.fn();

    const inspirations = await fetchExternalInspirations({
      env: { [MOCK_INSPIRATIONS_ENV]: "true" },
      fetchImpl: fetchMock
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(inspirations.length).toBeGreaterThan(3);
    expect(inspirations[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^mock-/),
        title: expect.any(String),
        detail: expect.any(String)
      })
    );
  });

  it("filters mock inspirations by artifact type", async () => {
    const inspirations = await fetchExternalInspirations({
      env: { [MOCK_INSPIRATIONS_ENV]: "1" },
      artifactTypeId: "prd",
      fetchImpl: vi.fn()
    });

    expect(inspirations.length).toBeGreaterThan(0);
    expect(inspirations.every((inspiration) => inspiration.artifactTypeIds?.includes("prd"))).toBe(true);
    expect(inspirations.map((inspiration) => inspiration.title)).not.toContain("AI 产品经理的真实困境");
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
