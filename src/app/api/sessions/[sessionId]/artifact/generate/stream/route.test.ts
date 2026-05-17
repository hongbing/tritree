import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const streamDirectorArtifactMock = vi.hoisted(() => vi.fn());
const streamDirectorNextStepMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/lib/ai/director-stream", () => ({
  streamDirectorArtifact: streamDirectorArtifactMock,
  streamDirectorNextStep: streamDirectorNextStepMock
}));

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

const parentNode = {
  id: "node-1",
  sessionId: "session-1",
  parentId: null,
  parentOptionId: null,
  kind: "artifact",
  producedArtifactId: "artifact-1",
  sourceArtifactIds: [],
  roundIndex: 1,
  roundIntent: "Start",
  options: [{ id: "a", label: "扩写", description: "扩写", impact: "更完整", kind: "deepen" }],
  selectedOptionId: "a",
  foldedOptions: [],
  agentMessages: [],
  createdAt: "2026-04-27T00:00:00.000Z"
};

const childNode = {
  id: "node-2",
  sessionId: "session-1",
  parentId: "node-1",
  parentOptionId: "a",
  kind: "decision",
  producedArtifactId: null,
  sourceArtifactIds: [],
  roundIndex: 2,
  roundIntent: "扩写",
  options: [],
  selectedOptionId: null,
  foldedOptions: [],
  agentMessages: [],
  createdAt: "2026-04-27T00:00:00.000Z"
};

const parentArtifact = {
  id: "artifact-1",
  type: "social-post",
  version: 1,
  payload: { title: "旧", body: "旧正文", hashtags: ["#旧"], imagePrompt: "旧图" },
  sourceArtifactIds: [],
  createdByNodeId: "node-1",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z"
};

const state = {
  rootMemory: {
    id: "root",
    preferences: {
      artifactTypeId: "social-post",
      seed: "写一个产品故事",
      creationRequest: "",
      domains: ["创作"],
      tones: ["平静"],
      styles: ["观点型"],
      personas: ["实践者"]
    },
    summary: "Seed：写一个产品故事",
    learnedSummary: "",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  },
  session: {
    artifactTypeId: "social-post",
    id: "session-1",
    title: "Draft",
    status: "active",
    currentNodeId: "node-2",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  },
  currentNode: childNode,
  currentArtifact: null,
  artifacts: [parentArtifact],
  nodeArtifacts: [{ nodeId: "node-1", artifact: parentArtifact }],
  selectedPath: [parentNode, childNode],
  treeNodes: [parentNode, childNode],
  enabledSkillIds: [],
  enabledSkills: [],
  foldedBranches: []
};

beforeEach(() => {
  streamDirectorArtifactMock.mockReset();
  streamDirectorNextStepMock.mockReset();
  getRepositoryMock.mockReset();
  requireCurrentUserMock.mockReset();
  requireCurrentUserMock.mockResolvedValue(currentUser);
  streamDirectorNextStepMock.mockResolvedValue({
    action: "artifact",
    roundIntent: "可以生成作品"
  });
});

describe("POST /api/sessions/:sessionId/artifact/generate/stream", () => {
  it("streams artifact.replace and done when the director produces an artifact", async () => {
    const generatedArtifact = {
      type: "social-post",
      payload: { title: "新", body: "新正文", hashtags: ["#新"], imagePrompt: "新图" },
      sourceArtifactIds: ["artifact-1"]
    };
    const savedArtifact = {
      id: "artifact-2",
      version: 1,
      createdByNodeId: "node-2",
      createdAt: "2026-04-27T00:00:01.000Z",
      updatedAt: "2026-04-27T00:00:01.000Z",
      ...generatedArtifact
    };
    const finalState = {
      ...state,
      currentArtifact: savedArtifact,
      artifacts: [...state.artifacts, savedArtifact],
      nodeArtifacts: [...state.nodeArtifacts, { nodeId: "node-2", artifact: savedArtifact }],
      currentNode: { ...childNode, kind: "artifact", producedArtifactId: "artifact-2" }
    };
    const updateNodeArtifact = vi.fn().mockReturnValue(finalState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      updateNodeArtifact
    });
    streamDirectorArtifactMock.mockImplementation(async (_parts, options) => {
      options.onReasoningText({ delta: "开始写。", accumulatedText: "开始写。" });
      return {
        roundIntent: "扩写",
        artifact: generatedArtifact,
        agentMessages: [{ role: "assistant", content: "ok" }]
      };
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(updateNodeArtifact).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-2",
      roundIntent: "扩写",
      artifact: generatedArtifact,
      agentMessages: [{ role: "assistant", content: "ok" }]
    });
    expect(text).toContain('"type":"thinking"');
    expect(text).toContain('"stage":"artifact"');
    expect(text).toContain('"type":"artifact.replace"');
    expect(text).toContain('"id":"artifact-2"');
    expect(text).toContain('"type":"done"');
    expect(text.indexOf('"type":"artifact.replace"')).toBeLessThan(text.indexOf('"type":"done"'));
  });

  it("finishes with done and no artifact.replace when the director produces no artifact", async () => {
    const finalState = {
      ...state,
      currentNode: { ...childNode, roundIntent: "当前只完成分析", isTerminal: true }
    };
    const completeNode = vi.fn().mockReturnValue(finalState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      completeNode
    });
    streamDirectorArtifactMock.mockResolvedValue({
      roundIntent: "当前只完成分析",
      artifact: null
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(completeNode).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-2",
      output: { roundIntent: "当前只完成分析" }
    });
    expect(text).not.toContain('"type":"artifact.replace"');
    expect(text).toContain('"type":"done"');
  });

  it("does not persist a second artifact when one appears after director generation starts", async () => {
    const generatedArtifact = {
      type: "social-post",
      payload: { title: "并发新稿", body: "并发新正文", hashtags: [], imagePrompt: "" },
      sourceArtifactIds: ["artifact-1"]
    };
    const existingArtifact = {
      id: "artifact-existing",
      version: 1,
      createdByNodeId: "node-2",
      createdAt: "2026-04-27T00:00:02.000Z",
      updatedAt: "2026-04-27T00:00:02.000Z",
      type: "social-post",
      payload: { title: "已保存", body: "另一个请求已经保存。", hashtags: [], imagePrompt: "" },
      sourceArtifactIds: ["artifact-1"]
    };
    const latestState = {
      ...state,
      currentArtifact: existingArtifact,
      artifacts: [...state.artifacts, existingArtifact],
      nodeArtifacts: [...state.nodeArtifacts, { nodeId: "node-2", artifact: existingArtifact }],
      currentNode: { ...childNode, kind: "artifact", producedArtifactId: "artifact-existing" }
    };
    const getSessionState = vi.fn().mockReturnValueOnce(state).mockReturnValueOnce(latestState);
    const updateNodeArtifact = vi.fn().mockReturnValue(latestState);
    getRepositoryMock.mockReturnValue({
      getSessionState,
      updateNodeArtifact
    });
    streamDirectorArtifactMock.mockResolvedValue({
      roundIntent: "扩写",
      artifact: generatedArtifact
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(getSessionState).toHaveBeenCalledTimes(2);
    expect(updateNodeArtifact).not.toHaveBeenCalled();
    expect(text).not.toContain('"type":"artifact.replace"');
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"id":"artifact-existing"');
  });
});
