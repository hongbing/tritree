import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

const artifact = {
  id: "artifact-1",
  type: "social-post",
  version: 1,
  payload: { title: "Original", body: "Original body", hashtags: [], imagePrompt: "" },
  sourceArtifactIds: [],
  createdByNodeId: "node-1",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z"
};

const node = {
  id: "node-1",
  sessionId: "session-1",
  parentId: null,
  parentOptionId: null,
  kind: "artifact",
  producedArtifactId: "artifact-1",
  sourceArtifactIds: [],
  roundIndex: 1,
  roundIntent: "Start",
  options: [],
  selectedOptionId: null,
  foldedOptions: [],
  agentMessages: [],
  createdAt: "2026-04-27T00:00:00.000Z"
};

const otherNode = {
  id: "node-2",
  sessionId: "session-1",
  parentId: "node-1",
  parentOptionId: "custom-rewrite-selection",
  kind: "decision",
  producedArtifactId: null,
  sourceArtifactIds: [],
  roundIndex: 2,
  roundIntent: "Other",
  options: [],
  selectedOptionId: null,
  foldedOptions: [],
  agentMessages: [],
  createdAt: "2026-04-27T00:00:01.000Z"
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
    currentNodeId: "node-1",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  },
  currentNode: node,
  currentArtifact: artifact,
  artifacts: [artifact],
  nodeArtifacts: [{ nodeId: "node-1", artifact }],
  selectedPath: [node],
  treeNodes: [node, otherNode],
  enabledSkillIds: [],
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

describe("POST /api/sessions/:sessionId/artifact/actions/:actionId", () => {
  it("dispatches a supported action through the bundled artifact plugin", async () => {
    const expectedPayload = { title: "Original", body: "Rewritten body", hashtags: [], imagePrompt: "" };
    const nextState = {
      ...state,
      session: { ...state.session, currentNodeId: "node-2" }
    };
    const createArtifactChild = vi.fn().mockReturnValue(nextState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      createArtifactChild
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/actions/rewrite-selection", {
        method: "POST",
        body: JSON.stringify({
          nodeId: "node-1",
          artifactId: "artifact-1",
          input: { field: "body", selectedText: "Original body", replacementText: "Rewritten body" }
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1", actionId: "rewrite-selection" }) }
    );

    expect(response.status).toBe(200);
    expect(createArtifactChild).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-1",
      selectedOptionId: "custom-rewrite-selection",
      customOption: expect.objectContaining({ id: "custom-rewrite-selection" }),
      roundIntent: "Original",
      artifact: {
        type: "social-post",
        payload: expectedPayload,
        sourceArtifactIds: ["artifact-1"]
      }
    });
    expect(await response.json()).toEqual({ state: nextState });
  });

  it("rejects unsupported plugin actions", async () => {
    const createArtifactChild = vi.fn();
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      createArtifactChild
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/actions/missing-action", {
        method: "POST",
        body: JSON.stringify({
          nodeId: "node-1",
          artifactId: "artifact-1",
          input: {}
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1", actionId: "missing-action" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "这个作品操作暂不支持。" });
    expect(createArtifactChild).not.toHaveBeenCalled();
  });

  it("rejects applying an artifact action through an unrelated node", async () => {
    const createArtifactChild = vi.fn();
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      createArtifactChild
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact/actions/rewrite-selection", {
        method: "POST",
        body: JSON.stringify({
          nodeId: "node-2",
          artifactId: "artifact-1",
          input: { field: "body", selectedText: "Original body", replacementText: "Rewritten body" }
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1", actionId: "rewrite-selection" }) }
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "这个作品不属于当前节点。" });
    expect(createArtifactChild).not.toHaveBeenCalled();
  });
});
