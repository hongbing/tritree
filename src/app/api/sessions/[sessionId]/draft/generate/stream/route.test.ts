import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { POST } from "./route";

const streamDirectorDraftMock = vi.hoisted(() => vi.fn());
const decideDirectorNextStepMock = vi.hoisted(() => vi.fn());
const streamDirectorNextStepMock = vi.hoisted(() => vi.fn());
const extractPartialDirectorDraftMock = vi.hoisted(() => vi.fn());
const extractActiveDirectorDraftFieldMock = vi.hoisted(() => vi.fn());
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
  decideDirectorNextStep: decideDirectorNextStepMock,
  streamDirectorNextStep: streamDirectorNextStepMock,
  streamDirectorDraft: streamDirectorDraftMock,
  extractPartialDirectorDraft: extractPartialDirectorDraftMock,
  extractActiveDirectorDraftField: extractActiveDirectorDraftFieldMock
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
  roundIndex: 2,
  roundIntent: "扩写",
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
      seed: "写一个产品故事",
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
    id: "session-1",
    title: "Draft",
    status: "active",
    currentNodeId: "node-2",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z"
  },
  currentNode: childNode,
  currentDraft: null,
  nodeDrafts: [{ nodeId: "node-1", draft: { title: "旧", body: "旧正文", hashtags: ["#旧"], imagePrompt: "旧图" } }],
  selectedPath: [parentNode, childNode],
  treeNodes: [parentNode, childNode],
  enabledSkillIds: [],
  enabledSkills: [],
  foldedBranches: [],
  publishPackage: null
};

beforeEach(() => {
  streamDirectorDraftMock.mockReset();
  decideDirectorNextStepMock.mockReset();
  streamDirectorNextStepMock.mockReset();
  extractPartialDirectorDraftMock.mockReset();
  extractActiveDirectorDraftFieldMock.mockReset();
  getRepositoryMock.mockReset();
  requireCurrentUserMock.mockReset();
  requireCurrentUserMock.mockResolvedValue(currentUser);
  decideDirectorNextStepMock.mockResolvedValue({
    action: "draft",
    roundIntent: "可以生成草稿",
  });
  streamDirectorNextStepMock.mockResolvedValue({
    action: "draft",
    roundIntent: "可以生成草稿",
  });
});

describe("POST /api/sessions/:sessionId/draft/generate/stream", () => {
  it("returns 401 when generating a draft without login", async () => {
    requireCurrentUserMock.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({})
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("streams partial draft events before persisting and sending done", async () => {
    const finalOutput = {
      roundIntent: "扩写",
      draft: { title: "新", body: "新正文", hashtags: ["#新"], imagePrompt: "新图" },
      finishAvailable: false,
      publishPackage: null,
      agentMessages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "statusServer_getStatus",
              input: { id: "123" }
            }
          ]
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "statusServer_getStatus",
              output: { type: "json", value: { text: "原始微博" } }
            }
          ]
        }
      ]
    };
    const finalState = {
      ...state,
      currentDraft: finalOutput.draft,
      nodeDrafts: [...state.nodeDrafts, { nodeId: "node-2", draft: finalOutput.draft }]
    };
    const updateNodeDraft = vi.fn().mockReturnValue(finalState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      updateNodeDraft
    });
    extractPartialDirectorDraftMock.mockReturnValueOnce({ title: "新", body: "新", hashtags: [], imagePrompt: "" });
    extractActiveDirectorDraftFieldMock.mockReturnValueOnce("body");
    streamDirectorDraftMock.mockImplementation(async (_parts, options) => {
      options.onReasoningText({ delta: "先理解选择。", accumulatedText: "先理解选择。" });
      options.onText({ delta: "新", accumulatedText: '{"draft":{"title":"新","body":"新' });
      return finalOutput;
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(text).toContain('"type":"thinking"');
    expect(text).toContain('"text":"先理解选择。"');
    expect(text).toContain('"type":"draft"');
    expect(text).toContain('"streamingField":"body"');
    expect(text).toContain('"type":"done"');
    expect(text.indexOf('"type":"thinking"')).toBeLessThan(text.indexOf('"type":"draft"'));
    expect(text.indexOf('"type":"draft"')).toBeLessThan(text.indexOf('"type":"done"'));
    expect(updateNodeDraft).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-2",
      output: {
        roundIntent: finalOutput.roundIntent,
        draft: finalOutput.draft
      },
      agentMessages: finalOutput.agentMessages
    });
  });

  it("lets the director continue with three choices instead of calling the draft agent", async () => {
    const nextStepOutput = {
      action: "options",
      roundIntent: "先澄清样式修改范围",
      options: [
        { id: "a", label: "补系统范围", description: "说明哪些页面或模块要改。", impact: "避免 PRD 编造范围。", kind: "deepen" },
        { id: "b", label: "补目标风格", description: "说明希望改成什么视觉方向。", impact: "让需求更明确。", kind: "reframe" },
        { id: "c", label: "补验收标准", description: "说明如何判断样式改好了。", impact: "让后续草稿可执行。", kind: "finish" }
      ],
      agentMessages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-2",
              toolName: "statusServer_getUserTimeline",
              input: { screenName: "来去之间" }
            }
          ]
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-2",
              toolName: "statusServer_getUserTimeline",
              output: { type: "json", value: { statuses: [{ text: "转发微博内容" }] } }
            }
          ]
        }
      ]
    };
    const routedState = {
      ...state,
      currentNode: {
        ...childNode,
        roundIntent: nextStepOutput.roundIntent,
        options: nextStepOutput.options
      },
      treeNodes: [
        parentNode,
        {
          ...childNode,
          roundIntent: nextStepOutput.roundIntent,
          options: nextStepOutput.options
        }
      ],
      selectedPath: [
        parentNode,
        {
          ...childNode,
          roundIntent: nextStepOutput.roundIntent,
          options: nextStepOutput.options
        }
      ]
    };
    const updateNodeOptions = vi.fn().mockReturnValue(routedState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      updateNodeOptions
    });
    streamDirectorNextStepMock.mockImplementation(async (_parts, options) => {
      options.onReasoningText({ delta: "先判断。", accumulatedText: "先判断。" });
      return nextStepOutput;
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(streamDirectorDraftMock).not.toHaveBeenCalled();
    expect(updateNodeOptions).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-2",
      output: {
        roundIntent: nextStepOutput.roundIntent,
        options: nextStepOutput.options,
      },
      agentMessages: nextStepOutput.agentMessages
    });
    expect(text).toContain('"text":"先判断。"');
    expect(text).toContain('"stage":"options"');
    expect(text).toContain('"type":"options"');
    expect(text).toContain('"roundIntent":"先澄清样式修改范围"');
    expect(text).toContain('"label":"补系统范围"');
    expect(text).toContain('"type":"done"');
    expect(text.indexOf('"type":"thinking"')).toBeLessThan(text.indexOf('"type":"options"'));
    expect(text.indexOf('"type":"options"')).toBeLessThan(text.indexOf('"type":"done"'));
  });

  it("lets the director complete the current path without drafting or asking again", async () => {
    const nextStepOutput = {
      action: "complete",
      roundIntent: "当前版本已经可以交付",
    };
    const completedState = {
      ...state,
      currentNode: {
        ...childNode,
        roundIntent: nextStepOutput.roundIntent,
        isTerminal: true
      },
      treeNodes: [
        parentNode,
        {
          ...childNode,
          roundIntent: nextStepOutput.roundIntent,
          isTerminal: true
        }
      ],
      selectedPath: [
        parentNode,
        {
          ...childNode,
          roundIntent: nextStepOutput.roundIntent,
          isTerminal: true
        }
      ]
    };
    const completeNode = vi.fn().mockReturnValue(completedState);
    const updateNodeOptions = vi.fn();
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      completeNode,
      updateNodeOptions
    });
    streamDirectorNextStepMock.mockResolvedValue(nextStepOutput);

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(streamDirectorDraftMock).not.toHaveBeenCalled();
    expect(updateNodeOptions).not.toHaveBeenCalled();
    expect(completeNode).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      nodeId: "node-2",
      output: {
        roundIntent: nextStepOutput.roundIntent,
      }
    });
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"isTerminal":true');
  });

  it("passes the request signal to the provider stream", async () => {
    const finalOutput = {
      roundIntent: "扩写",
      draft: { title: "新", body: "新正文", hashtags: ["#新"], imagePrompt: "新图" },
      finishAvailable: false,
      publishPackage: null
    };
    const finalState = { ...state, currentDraft: finalOutput.draft };
    const updateNodeDraft = vi.fn().mockReturnValue(finalState);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state),
      updateNodeDraft
    });
    streamDirectorDraftMock.mockResolvedValue(finalOutput);
    const request = new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
      method: "POST",
      body: JSON.stringify({ nodeId: "node-2" })
    });

    await (await POST(request, { params: Promise.resolve({ sessionId: "session-1" }) })).text();

    expect(streamDirectorDraftMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ signal: request.signal }));
  });

  it("closes silently when the client aborts during streaming generation", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const abortController = new AbortController();
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state)
    });
    streamDirectorNextStepMock.mockImplementation(async () => {
      abortController.abort(Object.assign(new Error(""), { name: "ResponseAborted" }));
      throw new Error("root: Required");
    });

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" }),
        signal: abortController.signal
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(text).toBe("");
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("does not persist again if another request saved the node draft before completion", async () => {
    const finalOutput = {
      roundIntent: "扩写",
      draft: { title: "新", body: "新正文", hashtags: ["#新"], imagePrompt: "新图" },
      finishAvailable: false,
      publishPackage: null
    };
    const latestState = {
      ...state,
      currentDraft: finalOutput.draft,
      nodeDrafts: [...state.nodeDrafts, { nodeId: "node-2", draft: finalOutput.draft }]
    };
    const updateNodeDraft = vi.fn();
    const getSessionState = vi.fn().mockReturnValueOnce(state).mockReturnValueOnce(latestState);
    getRepositoryMock.mockReturnValue({ getSessionState, updateNodeDraft });
    streamDirectorDraftMock.mockResolvedValue(finalOutput);

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(updateNodeDraft).not.toHaveBeenCalled();
    expect(text).toContain('"type":"done"');
    expect(text).toContain('"currentDraft":{"title":"新"');
  });

  it("logs upstream failures while streaming only a safe public error", async () => {
    const upstreamError = {
      statusCode: 400,
      responseBody: JSON.stringify({
        error: {
          message: "对话内容太长，已超出当前模型的处理能力。model_id: moonshot-kimi-k2.6"
        }
      })
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getRepositoryMock.mockReturnValue({
      getSessionState: vi.fn().mockReturnValue(state)
    });
    streamDirectorNextStepMock.mockRejectedValue(upstreamError);

    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/draft/generate/stream", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2" })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );
    const text = await response.text();

    expect(text).toContain("无法生成下一版草稿");
    expect(text).toContain("内容较长，已尝试压缩后仍超出当前模型处理范围");
    expect(text).not.toContain("model_id");
    expect(text).not.toContain("moonshot-kimi-k2.6");
    expect(consoleErrorSpy).toHaveBeenCalledWith("[treeable:generate-draft-stream]", upstreamError);

    consoleErrorSpy.mockRestore();
  });
});
