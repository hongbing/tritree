import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";
import { POST as EXTERNAL_POST } from "./generate-external/route";
import { POST as SAMPLES_POST } from "./generate-from-samples/route";

const mocks = vi.hoisted(() => ({
  fetchExternalStyleProfile: vi.fn(),
  generateStyleFromSamples: vi.fn(),
  requireCurrentUser: vi.fn()
}));

const currentUser = {
  id: "user-1",
  username: "awei",
  displayName: "Awei",
  role: "member",
  isActive: true,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z"
};

const skillDraft = {
  title: "我的风格：克制产品随笔",
  category: "风格",
  description: "短句、具体。",
  prompt: "使用短句，保留具体例子。",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
};

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/current-user")>("@/lib/auth/current-user");
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser
  };
});

vi.mock("@/lib/ai/style-profile-generator", () => ({
  generateStyleFromSamples: mocks.generateStyleFromSamples
}));

vi.mock("@/lib/skills/style-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/skills/style-profile")>("@/lib/skills/style-profile");
  return {
    ...actual,
    fetchExternalStyleProfile: mocks.fetchExternalStyleProfile
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  mocks.generateStyleFromSamples.mockResolvedValue(skillDraft);
  mocks.fetchExternalStyleProfile.mockResolvedValue(skillDraft);
});

describe("/api/skills/style/generate-from-samples", () => {
  it("requires login", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await SAMPLES_POST(new Request("http://test.local/api/skills/style/generate-from-samples", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("returns a generated style skill draft without saving it", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。", "第二段代表作。"] })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.generateStyleFromSamples).toHaveBeenCalledWith({
      samples: ["第一段代表作。", "第二段代表作。"]
    });
    expect(await response.json()).toEqual({ skillDraft });
  });

  it("rejects invalid JSON bodies", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: [123] })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.generateStyleFromSamples).not.toHaveBeenCalled();
  });

  it("requires samples in the JSON body", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.generateStyleFromSamples).not.toHaveBeenCalled();
  });

  it("turns generation errors into public responses", async () => {
    mocks.generateStyleFromSamples.mockRejectedValueOnce(new StyleProfileGenerationError("请先粘贴至少一段代表作。", 400));

    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: [""] })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请先粘贴至少一段代表作。" });
  });

  it("uses the fallback response for unknown generation failures", async () => {
    mocks.generateStyleFromSamples.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 418 }));

    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。"] })
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "无法生成我的风格。" });
  });
});

describe("/api/skills/style/generate-external", () => {
  it("requires login", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await EXTERNAL_POST(new Request("http://test.local/api/skills/style/generate-external", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("uses the current user identity and returns a draft", async () => {
    const response = await EXTERNAL_POST(
      new Request("http://test.local/api/skills/style/generate-external", {
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchExternalStyleProfile).toHaveBeenCalledWith({
      user: { id: "user-1", username: "awei", displayName: "Awei" }
    });
    expect(await response.json()).toEqual({ skillDraft });
  });

  it("turns provider errors into public responses", async () => {
    mocks.fetchExternalStyleProfile.mockRejectedValueOnce(new StyleProfileGenerationError("外部风格生成没有配置。", 503));

    const response = await EXTERNAL_POST(new Request("http://test.local/api/skills/style/generate-external", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "外部风格生成没有配置。" });
  });

  it("uses the fallback response for unknown provider failures", async () => {
    mocks.fetchExternalStyleProfile.mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 503 }));

    const response = await EXTERNAL_POST(new Request("http://test.local/api/skills/style/generate-external", { method: "POST" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "无法生成我的风格。" });
  });
});
