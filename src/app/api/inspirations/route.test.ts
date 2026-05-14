import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { DEFAULTS_CONFIG_PATH_ENV } from "@/lib/defaults";
import { INSPIRATION_TOKEN_ENV, INSPIRATION_URL_ENV } from "@/lib/inspirations";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  requireCurrentUser: vi.fn()
}));

const currentUser = {
  id: "user-1",
  username: "awei",
  displayName: "Awei",
  role: "admin",
  isActive: true,
  createdAt: "2026-05-06T00:00:00.000Z",
  updatedAt: "2026-05-06T00:00:00.000Z"
};

const originalInspirationUrl = process.env[INSPIRATION_URL_ENV];
const originalInspirationToken = process.env[INSPIRATION_TOKEN_ENV];
const originalDefaultsConfigPath = process.env[DEFAULTS_CONFIG_PATH_ENV];

function writeDefaultsConfig() {
  const root = mkdtempSync(path.join(tmpdir(), "tritree-api-inspirations-"));
  const configPath = path.join(root, "defaults.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        systemSkills: [
          {
            id: "system-writer",
            title: "系统写作者",
            category: "风格",
            description: "负责生成草稿。",
            prompt: "写出下一版草稿。",
            appliesTo: "writer",
            defaultEnabled: true,
            isArchived: false
          }
        ],
        creationRequestOptions: [],
        inspirations: [
          { id: "social-idea", title: "社媒灵感", detail: "写一条社媒内容。", artifactTypeIds: ["social-post"] },
          { id: "prd-idea", title: "PRD 灵感", detail: "写一份 PRD。", artifactTypeIds: ["prd"] }
        ]
      },
      null,
      2
    )
  );
  return configPath;
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/current-user")>("@/lib/auth/current-user");
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser
  };
});

beforeEach(() => {
  delete process.env[INSPIRATION_URL_ENV];
  delete process.env[INSPIRATION_TOKEN_ENV];
  delete process.env[DEFAULTS_CONFIG_PATH_ENV];
  mocks.requireCurrentUser.mockReset();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalInspirationUrl === undefined) {
    delete process.env[INSPIRATION_URL_ENV];
  } else {
    process.env[INSPIRATION_URL_ENV] = originalInspirationUrl;
  }

  if (originalInspirationToken === undefined) {
    delete process.env[INSPIRATION_TOKEN_ENV];
  } else {
    process.env[INSPIRATION_TOKEN_ENV] = originalInspirationToken;
  }

  if (originalDefaultsConfigPath === undefined) {
    delete process.env[DEFAULTS_CONFIG_PATH_ENV];
  } else {
    process.env[DEFAULTS_CONFIG_PATH_ENV] = originalDefaultsConfigPath;
  }
});

describe("/api/inspirations", () => {
  it("returns 401 when listing inspirations without login", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await GET(new Request("http://test.local/api/inspirations?artifactTypeId=social-post"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("returns configured default inspirations when no external inspiration endpoint is configured", async () => {
    process.env[DEFAULTS_CONFIG_PATH_ENV] = writeDefaultsConfig();

    const response = await GET(new Request("http://test.local/api/inspirations?artifactTypeId=social-post"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      inspirations: [{ id: "social-idea", title: "社媒灵感", detail: "写一条社媒内容。", artifactTypeIds: ["social-post"] }]
    });
  });

  it("returns normalized inspirations from the configured endpoint", async () => {
    process.env[INSPIRATION_URL_ENV] = "https://ideas.example/list";
    process.env[INSPIRATION_TOKEN_ENV] = "secret-token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        inspirations: [
          { id: "idea-1", title: "  产品困境  ", detail: "  写 AI 产品经理的真实困境。  " },
          { id: "bad", title: "", detail: "不会出现" }
        ]
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://test.local/api/inspirations?artifactTypeId=social-post"));
    const data = await response.json();

    expect(response.status).toBe(200);
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
    expect(data).toEqual({
      inspirations: [{ id: "idea-1", title: "产品困境", detail: "写 AI 产品经理的真实困境。" }]
    });
  });
});
