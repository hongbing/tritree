import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { createSeedDraft } from "@/lib/seed-draft";
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

const resolvedSkills = [
  {
    id: "system-analysis",
    title: "分析",
    category: "方向",
    description: "拆解写作动机。",
    prompt: "先分析写作动机、读者和表达目标。",
    appliesTo: "editor",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z"
  }
];

beforeEach(() => {
  getRepositoryMock.mockReset();
  requireCurrentUserMock.mockReset();
  requireCurrentUserMock.mockResolvedValue(currentUser);
});

describe("createSeedDraft", () => {
  it("uses a content-derived title instead of the fixed seed placeholder", () => {
    const draft = createSeedDraft("小林是某厂的产品经理，每周要跟进十几个需求迭代。她的习惯很规范。");

    expect(draft.title).toBe("小林是某厂的产品经理");
    expect(draft.title).not.toBe("种子念头");
    expect(draft.body).toContain("小林是某厂的产品经理");
  });
});

describe("GET /api/sessions", () => {
  it("lists active draft summaries for the current user", async () => {
    const listSessionSummaries = vi.fn().mockReturnValue([
      {
        id: "session-1",
        title: "Draft one",
        status: "active",
        currentNodeId: "node-1",
        currentRoundIndex: 2,
        bodyExcerpt: "Draft body",
        bodyLength: 10,
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
    expect(data.drafts).toEqual([expect.objectContaining({ id: "session-1", title: "Draft one" })]);
  });

  it("lists archived draft summaries for the current user", async () => {
    const listSessionSummaries = vi.fn().mockReturnValue([
      {
        id: "session-archived",
        title: "Archived",
        status: "active",
        currentNodeId: "node-archived",
        currentRoundIndex: 1,
        bodyExcerpt: "Archived body",
        bodyLength: 13,
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
    expect(data.drafts[0].isArchived).toBe(true);
  });

  it("rejects an empty draft view parameter", async () => {
    const getLatestSessionState = vi.fn();
    getRepositoryMock.mockReturnValue({ getLatestSessionState });

    const response = await GET(new Request("http://test.local/api/sessions?view="));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "不支持的草稿视图。" });
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

  it("creates a session draft without generating options", async () => {
    const draftState = {
      rootMemory: {
        id: "root",
        preferences: {
          seed: "写一篇解释为什么要写作的文章",
          domains: ["创作"],
          tones: ["平静"],
          styles: ["观点型"],
          personas: ["实践者"]
        },
        summary: "Seed：写一篇解释为什么要写作的文章",
        learnedSummary: "",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      },
      session: {
        id: "session-1",
        title: "Draft",
        status: "active",
        currentNodeId: "node-1",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      },
      currentNode: {
        id: "node-1",
        sessionId: "session-1",
        parentId: null,
        parentOptionId: null,
        roundIndex: 1,
        roundIntent: "选择起始方式",
        options: [],
        selectedOptionId: null,
        foldedOptions: [],
        agentMessages: [],
        createdAt: "2026-04-26T00:00:00.000Z"
      },
      currentDraft: createSeedDraft("写一篇解释为什么要写作的文章"),
      nodeDrafts: [{ nodeId: "node-1", draft: createSeedDraft("写一篇解释为什么要写作的文章") }],
      selectedPath: [],
      treeNodes: [],
      enabledSkillIds: ["system-analysis"],
      enabledSkills: resolvedSkills,
      foldedBranches: [],
      publishPackage: null
    };
    const createSessionDraft = vi.fn().mockReturnValue(draftState);
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => ({
        id: "root",
        preferences: {
          seed: "写一篇解释为什么要写作的文章",
          domains: ["创作"],
          tones: ["平静"],
          styles: ["观点型"],
          personas: ["实践者"]
        },
        summary: "Seed：写一篇解释为什么要写作的文章",
        learnedSummary: "",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      }),
      defaultEnabledSkillIds: vi.fn(() => ["system-analysis"]),
      createSessionDraft
    });

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createSessionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        rootMemoryId: "root",
        draft: expect.objectContaining({ body: "写一篇解释为什么要写作的文章" })
      })
    );
    expect(data.state).toEqual(draftState);
  });

  it("keeps the seed draft body raw when creating the session", async () => {
    const rootMemoryWithRequest = {
      id: "root",
      preferences: {
        seed: "写一篇解释为什么要写作的文章",
        creationRequest: "改成英文的，保留口语感",
        domains: ["创作"],
        tones: ["平静"],
        styles: ["观点型"],
        personas: ["实践者"]
      },
      summary: [
        "Seed：写一篇解释为什么要写作的文章",
        "本次创作要求：改成英文的，保留口语感"
      ].join("\n"),
      learnedSummary: "",
      createdAt: "2026-04-26T00:00:00.000Z",
      updatedAt: "2026-04-26T00:00:00.000Z"
    };
    const draftState = {
      rootMemory: rootMemoryWithRequest,
      session: {
        id: "session-1",
        title: "Draft",
        status: "active",
        currentNodeId: "node-1",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      },
      currentNode: {
        id: "node-1",
        sessionId: "session-1",
        parentId: null,
        parentOptionId: null,
        roundIndex: 1,
        roundIntent: "选择起始方式",
        options: [],
        selectedOptionId: null,
        foldedOptions: [],
        agentMessages: [],
        createdAt: "2026-04-26T00:00:00.000Z"
      },
      currentDraft: createSeedDraft("写一篇解释为什么要写作的文章"),
      nodeDrafts: [{ nodeId: "node-1", draft: createSeedDraft("写一篇解释为什么要写作的文章") }],
      selectedPath: [],
      treeNodes: [],
      enabledSkillIds: ["system-analysis"],
      enabledSkills: resolvedSkills,
      foldedBranches: [],
      publishPackage: null
    };
    const createSessionDraft = vi.fn().mockReturnValue(draftState);
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => rootMemoryWithRequest,
      defaultEnabledSkillIds: vi.fn(() => ["system-analysis"]),
      createSessionDraft
    });

    const response = await POST(new Request("http://test.local/api/sessions", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createSessionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        draft: expect.objectContaining({
          body: "写一篇解释为什么要写作的文章"
        })
      })
    );
    expect(data.state.rootMemory.summary).toContain("本次创作要求：改成英文的，保留口语感");
  });

  it("starts a session with selected enabled skill ids", async () => {
    const draftState = {
      rootMemory: {
        id: "root",
        preferences: {
          seed: "写一篇解释为什么要写作的文章",
          domains: ["创作"],
          tones: ["平静"],
          styles: ["观点型"],
          personas: ["实践者"]
        },
        summary: "Seed：写一篇解释为什么要写作的文章",
        learnedSummary: "",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      },
      session: {
        id: "session-1",
        title: "Draft",
        status: "active",
        currentNodeId: "node-1",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      },
      currentNode: {
        id: "node-1",
        sessionId: "session-1",
        parentId: null,
        parentOptionId: null,
        roundIndex: 1,
        roundIntent: "选择起始方式",
        options: [],
        selectedOptionId: null,
        foldedOptions: [],
        agentMessages: [],
        createdAt: "2026-04-26T00:00:00.000Z"
      },
      currentDraft: createSeedDraft("写一篇解释为什么要写作的文章"),
      nodeDrafts: [{ nodeId: "node-1", draft: createSeedDraft("写一篇解释为什么要写作的文章") }],
      selectedPath: [],
      treeNodes: [],
      enabledSkillIds: ["system-analysis"],
      enabledSkills: resolvedSkills,
      foldedBranches: [],
      publishPackage: null
    };
    const createSessionDraft = vi.fn().mockReturnValue(draftState);
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => ({
        id: "root",
        preferences: {
          seed: "写一篇解释为什么要写作的文章",
          domains: ["创作"],
          tones: ["平静"],
          styles: ["观点型"],
          personas: ["实践者"]
        },
        summary: "Seed：写一篇解释为什么要写作的文章",
        learnedSummary: "",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      }),
      defaultEnabledSkillIds: vi.fn(() => ["system-analysis"]),
      createSessionDraft
    });

    const response = await POST(
      new Request("http://test.local/api/sessions", {
        method: "POST",
        body: JSON.stringify({ enabledSkillIds: ["system-analysis", "system-no-hype-title"] })
      })
    );

    expect(response.status).toBe(200);
    expect(createSessionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        enabledSkillIds: ["system-analysis", "system-no-hype-title"]
      })
    );
  });

  it("returns a server error if creating the session draft fails", async () => {
    getRepositoryMock.mockReturnValue({
      getRootMemory: () => ({
        id: "root",
        preferences: {
          seed: "写一篇青岛旅游攻略",
          domains: ["旅行"],
          tones: ["轻松"],
          styles: ["攻略"],
          personas: ["旅行者"]
        },
        summary: "Seed：写一篇青岛旅游攻略",
        learnedSummary: "",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z"
      }),
      defaultEnabledSkillIds: vi.fn(() => ["system-analysis"]),
      createSessionDraft: vi.fn(() => {
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
