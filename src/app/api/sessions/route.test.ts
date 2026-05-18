import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { GET, POST } from "./route";

const getRepositoryMock = vi.hoisted(() => vi.fn());
const requireCurrentUserMock = vi.hoisted(() => vi.fn());

const currentUser = {
  id: "user-1",
  username: "awei",
  displayName: "Awei",
  role: "admin",
  isActive: true,
  createdAt: "2026-05-06T00:00:00.000Z",
  updatedAt: "2026-05-06T00:00:00.000Z"
};

const rootMemory = {
  id: "root",
  preferences: {
    artifactTypeId: "social-post",
    seed: "写一篇解释为什么要写作的文章",
    creationRequest: "",
    domains: ["创作"],
    tones: ["平静"],
    styles: ["观点型"],
    personas: ["实践者"]
  },
  summary: "Seed：写一篇解释为什么要写作的文章",
  learnedSummary: "",
  createdAt: "2026-04-26T00:00:00.000Z",
  updatedAt: "2026-04-26T00:00:00.000Z"
};

const sessionState = {
  rootMemory,
  session: {
    artifactTypeId: "social-post",
    id: "session-1",
    title: "Work",
    status: "active",
    currentNodeId: "node-1",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z"
  },
  currentNode: null,
  currentArtifact: null,
  artifacts: [],
  nodeArtifacts: [],
  selectedPath: [],
  treeNodes: [],
  enabledSkillIds: ["system-analysis"],
  enabledSkills: [],
  foldedBranches: []
};

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/current-user")>("@/lib/auth/current-user");
  return {
    ...actual,
    requireCurrentUser: requireCurrentUserMock
  };
});

vi.mock("@/lib/db/repository", () => ({
  getRepository: getRepositoryMock
}));

beforeEach(() => {
  getRepositoryMock.mockReset();
  requireCurrentUserMock.mockReset();
  requireCurrentUserMock.mockResolvedValue(currentUser);
});

describe("GET /api/sessions", () => {
  it("lists active work summaries for the current user", async () => {
    const listSessionSummaries = vi.fn().mockReturnValue([
      {
        id: "session-1",
        title: "Work one",
        status: "active",
        currentNodeId: "node-1",
        currentRoundIndex: 2,
        artifactExcerpt: "Work body",
        artifactSummaryLength: 10,
        isArchived: false,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T01:00:00.000Z"
      }
    ]);
    getRepositoryMock.mockReturnValue({ listSessionSummaries });

    const response = await GET(new Request("http://test.local/api/sessions?view=active"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listSessionSummaries).toHaveBeenCalledWith("user-1", { archived: false });
    expect(data.works).toEqual([expect.objectContaining({ id: "session-1", title: "Work one" })]);
  });

  it("lists archived work summaries for the current user", async () => {
    const listSessionSummaries = vi.fn().mockReturnValue([
      {
        id: "session-archived",
        title: "Archived",
        status: "active",
        currentNodeId: "node-archived",
        currentRoundIndex: 1,
        artifactExcerpt: "Archived body",
        artifactSummaryLength: 13,
        isArchived: true,
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T01:00:00.000Z"
      }
    ]);
    getRepositoryMock.mockReturnValue({ listSessionSummaries });

    const response = await GET(new Request("http://test.local/api/sessions?view=archived"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listSessionSummaries).toHaveBeenCalledWith("user-1", { archived: true });
    expect(data.works[0].isArchived).toBe(true);
  });

  it("rejects an empty work view parameter", async () => {
    const getLatestSessionState = vi.fn();
    getRepositoryMock.mockReturnValue({ getLatestSessionState });

    const response = await GET(new Request("http://test.local/api/sessions?view="));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "不支持的作品视图。" });
    expect(getLatestSessionState).not.toHaveBeenCalled();
  });
});

describe("POST /api/sessions", () => {
  it("returns 401 when starting a session without login", async () => {
    requireCurrentUserMock.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("creates a session without generating options", async () => {
    const createSession = vi.fn().mockReturnValue(sessionState);
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => rootMemory,
      createSession
    });

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith({
      userId: "user-1",
      rootMemoryId: "root"
    });
    expect(data.state).toEqual(sessionState);
  });

  it("passes only the root memory id so seed text stays owned by the repository", async () => {
    const createSession = vi.fn().mockReturnValue({ ...sessionState, rootMemory });
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => ({
        ...rootMemory,
        preferences: {
          ...rootMemory.preferences,
          creationRequest: "改成英文的，保留口语感"
        }
      }),
      createSession
    });

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith({
      userId: "user-1",
      rootMemoryId: "root"
    });
  });

  it("starts a session with selected enabled skill ids", async () => {
    const createSession = vi.fn().mockReturnValue(sessionState);
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => rootMemory,
      createSession
    });

    const response = await POST(
      new Request("http://test.local/api/sessions", {
        method: "POST",
        body: JSON.stringify({ enabledSkillIds: ["system-analysis", "system-no-hype-title"] })
      })
    );

    expect(response.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith({
      userId: "user-1",
      rootMemoryId: "root",
      enabledSkillIds: ["system-analysis", "system-no-hype-title"]
    });
  });

  it("returns a server error if creating the session fails", async () => {
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => rootMemory,
      createSession: vi.fn(() => {
        throw new Error("database unavailable");
      })
    });

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("无法启动创作。");
  });

  it("rejects malformed session start JSON", async () => {
    const response = await POST(
      new Request("http://test.local/api/sessions", {
        method: "POST",
        body: "{not-json"
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("请求不是有效的 JSON。");
    expect(getRepositoryMock).not.toHaveBeenCalled();
  });
});
