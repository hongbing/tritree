import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const getArtifactPluginMock = vi.hoisted(() => vi.fn());
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
  type: "test-artifact",
  version: 1,
  payload: { title: "Original", body: "Original body" },
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
  treeNodes: [node],
  enabledSkillIds: [],
  enabledSkills: [],
  foldedBranches: []
};

vi.mock("server-only", () => ({}));

vi.mock("@/artifacts/registry", () => ({
  getArtifactPlugin: getArtifactPluginMock
}));

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
  getArtifactPluginMock.mockReset();
  getRepositoryMock.mockReset();
  requireCurrentUserMock.mockReset();
  requireCurrentUserMock.mockResolvedValue(currentUser);
});

describe("POST /api/sessions/:sessionId/artifact/actions/:actionId", () => {
  it("dispatches a supported plugin action", async () => {
    const actionResult = {
      payload: { title: "Rewritten", body: "Rewritten body" }
    };
    const handleAction = vi.fn().mockResolvedValue(actionResult);
    getArtifactPluginMock.mockReturnValue({
      id: "test-artifact",
      label: "Test artifact",
      payloadSchema: z.object({ title: z.string(), body: z.string() }),
      capabilities: { actions: ["rewrite-selection"] },
      handleAction,
      summarizeForTree: vi.fn().mockReturnValue("Rewritten")
    });
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
          input: { selectedText: "Original", instruction: "Make it clearer" }
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1", actionId: "rewrite-selection" }) }
    );

    expect(response.status).toBe(200);
    expect(handleAction).toHaveBeenCalledWith({
      artifact,
      input: { selectedText: "Original", instruction: "Make it clearer" },
      sessionState: state
    });
    expect(createArtifactChild).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-1",
      selectedOptionId: "custom-rewrite-selection",
      customOption: expect.objectContaining({ id: "custom-rewrite-selection" }),
      roundIntent: "Rewritten",
      artifact: {
        type: "test-artifact",
        payload: actionResult.payload,
        sourceArtifactIds: ["artifact-1"]
      }
    });
    expect(await response.json()).toEqual({ state: nextState });
  });

  it("rejects unsupported plugin actions", async () => {
    const createArtifactChild = vi.fn();
    getArtifactPluginMock.mockReturnValue({
      id: "test-artifact",
      label: "Test artifact",
      payloadSchema: z.object({ title: z.string(), body: z.string() }),
      capabilities: { actions: ["supported-action"] },
      handleAction: vi.fn()
    });
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
});
