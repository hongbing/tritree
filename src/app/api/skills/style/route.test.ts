import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";
import { POST as EXTERNAL_POST } from "./generate-external/route";
import { POST as SAMPLES_POST } from "./generate-from-samples/route";

const mocks = vi.hoisted(() => ({
  fetchExternalStyleProfile: vi.fn(),
  streamStyleFromSamples: vi.fn(),
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
  appliesTo: "both",
  defaultEnabled: true,
  isArchived: false
};

let consoleInfoSpy: ReturnType<typeof vi.spyOn>;

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/current-user")>("@/lib/auth/current-user");
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser
  };
});

vi.mock("@/lib/ai/style-profile-generator", () => ({
  streamStyleFromSamples: mocks.streamStyleFromSamples
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
  consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  mocks.streamStyleFromSamples.mockResolvedValue(skillDraft);
  mocks.fetchExternalStyleProfile.mockResolvedValue(skillDraft);
});

afterEach(() => {
  consoleInfoSpy.mockRestore();
});

describe("/api/skills/style/generate-from-samples", () => {
  it("requires login", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await SAMPLES_POST(new Request("http://test.local/api/skills/style/generate-from-samples", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("streams partial and final style skill drafts without saving them", async () => {
    mocks.streamStyleFromSamples.mockImplementationOnce(async ({ onPartialDraft }) => {
      onPartialDraft({ title: "我的风格：克制产品随笔", description: "短句、具体。" });
      return skillDraft;
    });
    const request = new Request("http://test.local/api/skills/style/generate-from-samples", {
      method: "POST",
      body: JSON.stringify({ samples: ["第一段代表作。\n\n第二段代表作。"] })
    });

    const response = await SAMPLES_POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(mocks.streamStyleFromSamples).toHaveBeenCalledWith({
      samples: ["第一段代表作。\n\n第二段代表作。"],
      signal: request.signal,
      onPartialDraft: expect.any(Function)
    });
    const text = await response.text();
    expect(text).toContain('"type":"progress"');
    expect(text).toContain('"type":"draft"');
    expect(text).toContain('"skillDraft":{"title":"我的风格：克制产品随笔","description":"短句、具体。"}');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"skillDraft":{"title":"我的风格：克制产品随笔"');
  });

  it("logs one profile generation request and one final response without streaming partials", async () => {
    mocks.streamStyleFromSamples.mockImplementationOnce(async ({ onPartialDraft }) => {
      onPartialDraft({ title: "我的风格：克制产品随笔", description: "短句、具体。" });
      return skillDraft;
    });
    const request = new Request("http://test.local/api/skills/style/generate-from-samples", {
      method: "POST",
      body: JSON.stringify({ samples: ["第一段代表作。\n\n第二段代表作。"] })
    });

    const response = await SAMPLES_POST(request);
    await response.text();

    const styleProfileLogs = consoleInfoSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0]).startsWith("[tritree:style-profile:")
    );
    expect(styleProfileLogs).toHaveLength(2);
    expect(styleProfileLogs[0][0]).toBe("[tritree:style-profile:request]");
    expect(JSON.parse(styleProfileLogs[0][1] as string)).toEqual({
      source: "samples",
      samples: ["第一段代表作。\n\n第二段代表作。"]
    });
    expect(styleProfileLogs[1][0]).toBe("[tritree:style-profile:response]");
    expect(JSON.parse(styleProfileLogs[1][1] as string)).toEqual({
      source: "samples",
      skillDraft
    });
  });

  it("keeps the entire pasted representative text as one sample", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。\n\n第二段代表作。"] })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.streamStyleFromSamples).toHaveBeenCalledWith({
      samples: ["第一段代表作。\n\n第二段代表作。"],
      signal: expect.any(AbortSignal),
      onPartialDraft: expect.any(Function)
    });
  });

  it("rejects schema-invalid JSON bodies", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: [123] })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.streamStyleFromSamples).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请求不是有效的 JSON。" });
    expect(mocks.streamStyleFromSamples).not.toHaveBeenCalled();
  });

  it("requires samples in the JSON body", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.streamStyleFromSamples).not.toHaveBeenCalled();
  });

  it("rejects blank sample content before starting the stream", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: [""] })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "请先粘贴至少一段代表作。" });
    expect(mocks.streamStyleFromSamples).not.toHaveBeenCalled();
  });

  it("streams generation errors after the stream starts", async () => {
    mocks.streamStyleFromSamples.mockRejectedValueOnce(new StyleProfileGenerationError("模型暂时不可用。", 502));

    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。"] })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"type":"error","error":"模型暂时不可用。"');
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[tritree:style-profile:response]",
      JSON.stringify({ source: "samples", error: "模型暂时不可用。" }, null, 2)
    );
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
