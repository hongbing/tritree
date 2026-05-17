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

const rootMemory = {
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

const state = {
  rootMemory,
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
  currentArtifact: {
    id: "artifact-1",
    type: "social-post",
    version: 1,
    payload: { title: "Draft", body: "Draft body", hashtags: ["#draft"], imagePrompt: "draft image" },
    sourceArtifactIds: [],
    createdByNodeId: "node-1",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  },
  artifacts: [
    {
      id: "artifact-1",
      type: "social-post",
      version: 1,
      payload: { title: "Draft", body: "Draft body", hashtags: ["#draft"], imagePrompt: "draft image" },
      sourceArtifactIds: [],
      createdByNodeId: "node-1",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    }
  ],
  nodeArtifacts: [],
  selectedPath: [node],
  treeNodes: [node],
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

describe("POST /api/sessions/:sessionId/artifact", () => {
  it("saves a plugin-validated artifact child", async () => {
    const nextState = {
      ...state,
      session: { ...state.session, currentNodeId: "node-2" },
      currentNode: { ...node, id: "node-2", parentId: "node-1", producedArtifactId: "artifact-2" }
    };
    const createArtifactChild = vi.fn().mockReturnValue(nextState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      createArtifactChild
    });

    const artifact = {
      type: "social-post",
      payload: { title: "Edited", body: "Edited body", hashtags: ["#edited"], imagePrompt: "edited image" },
      sourceArtifactIds: ["artifact-1"]
    };
    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-1", artifact })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );

    expect(response.status).toBe(200);
    expect(createArtifactChild).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-1",
      selectedOptionId: "custom-edit",
      customOption: expect.objectContaining({ id: "custom-edit" }),
      roundIntent: "Edited",
      artifact
    });
    expect(await response.json()).toEqual({ state: nextState });
  });

  it("rejects unknown artifact types", async () => {
    const createArtifactChild = vi.fn();
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      createArtifactChild
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact", {
        method: "POST",
        body: JSON.stringify({
          nodeId: "node-1",
          artifact: { type: "unknown-artifact", payload: { title: "Nope" } }
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "不支持的作品类型。" });
    expect(createArtifactChild).not.toHaveBeenCalled();
  });
});
