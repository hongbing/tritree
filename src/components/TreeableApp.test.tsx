import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TreeableApp } from "./TreeableApp";
import { listArtifactTypes } from "@/lib/artifacts";
import type { Artifact, SessionState, Skill } from "@/lib/domain";

const artifactWorkspaceMock = vi.hoisted(() => vi.fn());
const liveDraftMock = artifactWorkspaceMock;
const treeCanvasMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signOut: signOutMock
}));

vi.mock("@/components/tree/TreeCanvas", () => ({
  TreeCanvas: ({
    changedDraftNodeIds,
    comparisonNodeIds,
    currentNode,
    display = "full",
    generationStage,
    isBusy,
    isComparisonMode,
    onActivateBranch,
    onAddCustomOption,
    onChoose,
    onRegenerateOptions,
    onSelectComparisonNode,
    onViewNode,
    skills
  }: {
    changedDraftNodeIds?: string[];
    comparisonNodeIds?: { fromNodeId: string | null; toNodeId: string | null } | null;
    currentNode: { id: string; options: Array<{ id: "a"; label: string } | { id: string; label: string }>; roundIntent?: string } | null;
    display?: "full" | "options" | "tree";
    generationStage?: { nodeId: string; stage: "draft" | "options" } | null;
    isBusy: boolean;
    isComparisonMode?: boolean;
    onActivateBranch?: (nodeId: string, optionId: "a") => void;
    onAddCustomOption?: (option: { id: string; label: string; description: string; impact: string; kind: "reframe" }) => void;
    onChoose?: (optionId: "a") => void;
    onRegenerateOptions?: (optionMode: "focused") => void;
    onSelectComparisonNode?: (nodeId: string) => void;
    onViewNode?: (nodeId: string) => void;
    skills?: Skill[];
  }) =>
    treeCanvasMock({
      changedDraftNodeIds,
      comparisonNodeIds,
      currentNode,
      display,
      generationStage,
      isBusy,
      isComparisonMode,
      onActivateBranch,
      onAddCustomOption,
      onChoose,
      onRegenerateOptions,
      onSelectComparisonNode,
      onViewNode,
      skills
    }) || (
      <div data-testid="tree-canvas">
        {isBusy ? "choices disabled" : "choices enabled"}
        {isComparisonMode ? " comparison mode" : ""}
        <div data-testid="canvas-display">{display}</div>
        <div data-testid="canvas-current-node">{currentNode?.id ?? "none"}</div>
        <div data-testid="canvas-round-intent">{currentNode?.roundIntent ?? ""}</div>
        <div data-testid="canvas-generation-stage">
          {generationStage ? `${generationStage.nodeId}:${generationStage.stage}` : "idle"}
        </div>
        <div data-testid="canvas-options">{currentNode?.options.map((option) => option.label).join("|") ?? ""}</div>
        <div data-testid="canvas-skills">{skills?.map((skill) => skill.title).join("|")}</div>
        {display !== "options" ? (
          <>
            <button onClick={() => onActivateBranch?.("node-1", "a")} type="button">
              activate historical branch
            </button>
            <button onClick={() => onViewNode?.("node-2")} type="button">
              view historical node
            </button>
            <button onClick={() => onSelectComparisonNode?.("node-3")} type="button">
              select comparison node 3
            </button>
            <button onClick={() => onSelectComparisonNode?.("node-1")} type="button">
              select comparison node 1
            </button>
          </>
        ) : null}
        {display !== "tree" ? (
          <>
            <button onClick={() => onChoose?.("a")} type="button">
              choose displayed option
            </button>
            <button onClick={() => onRegenerateOptions?.("focused")} type="button">
              regenerate focused options
            </button>
            <button
              onClick={() =>
                onAddCustomOption?.({
                  id: "custom-skill",
                  label: "润色",
                  description: "使用技能「润色」继续。",
                  impact: "按当前作品启用技能继续生成。",
                  kind: "reframe"
                })
              }
              type="button"
            >
              use custom skill option
            </button>
          </>
        ) : null}
      </div>
    )
}));

vi.mock("@/components/artifacts/ArtifactWorkspace", () => ({
  ArtifactWorkspace: (props: {
    artifacts: Artifact[];
    currentNode: { id: string; options?: Array<{ id: string; label: string }> } | null;
    isBusy: boolean;
    isGenerating: boolean;
    onAction?: (actionId: string, artifact: Artifact) => void | Promise<void>;
    onSave?: (artifact: Artifact) => void | Promise<void>;
    onSelectArtifact?: (artifactId: string) => void;
    selectedArtifactId: string | null;
    thinkingText?: string;
  }) => {
    artifactWorkspaceMock(props);
    const selectedArtifact = props.artifacts.find((artifact) => artifact.id === props.selectedArtifactId) ?? null;
    return (
      <div data-testid="artifact-workspace">
        <div data-testid="artifact-workspace-selected">{props.selectedArtifactId ?? "none"}</div>
        <div data-testid="artifact-workspace-artifacts">{props.artifacts.map((artifact) => artifact.id).join("|")}</div>
        <div data-testid="artifact-generation-status">
          {props.isGenerating ? `artifact:streaming:${props.thinkingText ?? ""}` : "idle"}
        </div>
        {props.artifacts.map((artifact) => (
          <button key={artifact.id} onClick={() => props.onSelectArtifact?.(artifact.id)} type="button">
            select {artifact.id}
          </button>
        ))}
        <button
          onClick={() => selectedArtifact && props.onAction?.("rewrite-selection", selectedArtifact)}
          type="button"
        >
          artifact action
        </button>
        <button
          onClick={() => selectedArtifact && props.onSave?.({ ...selectedArtifact, version: selectedArtifact.version + 1 })}
          type="button"
        >
          save artifact
        </button>
      </div>
    );
  }
}));

const rootMemory = {
  id: "default",
  preferences: {
    artifactTypeId: "social-post" as const,
    creationRequest: "",
    seed: "我想写 AI 产品经理的真实困境",
    domains: ["AI"],
    tones: ["Calm"],
    styles: ["Opinion-driven"],
    personas: ["Practitioner"]
  },
  summary: "Seed：我想写 AI 产品经理的真实困境",
  learnedSummary: "",
  createdAt: "2026-04-24T00:00:00.000Z",
  updatedAt: "2026-04-24T00:00:00.000Z"
};

const skills: Skill[] = [
  {
    id: "system-analysis",
    title: "分析",
    category: "方向",
    description: "拆解问题。",
    prompt: "分析 prompt",
    appliesTo: "editor",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z"
  },
  {
    id: "system-no-hype-title",
    title: "标题不要夸张",
    category: "约束",
    description: "避免标题党。",
    prompt: "约束 prompt",
    appliesTo: "both",
    isSystem: true,
    defaultEnabled: false,
    isArchived: false,
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z"
  }
];

const finishedState = {
  rootMemory,
  session: {
    id: "session-1",
    title: "Finished",
    status: "finished",
    currentNodeId: "node-1",
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z"
  },
  currentNode: {
    id: "node-1",
    sessionId: "session-1",
    parentId: null,
    roundIndex: 1,
    roundIntent: "Finish",
    options: [
      { id: "a", label: "A", description: "A", impact: "A", kind: "finish" },
      { id: "b", label: "B", description: "B", impact: "B", kind: "finish" },
      { id: "c", label: "C", description: "C", impact: "C", kind: "finish" }
    ],
    selectedOptionId: null,
    foldedOptions: [],
    agentMessages: [],
    createdAt: "2026-04-24T00:00:00.000Z"
  },
  currentDraft: { title: "Finished", body: "Ready", hashtags: ["#AI"], imagePrompt: "Tree" },
  nodeDrafts: [{ nodeId: "node-1", draft: { title: "Finished", body: "Ready", hashtags: ["#AI"], imagePrompt: "Tree" } }],
  selectedPath: [],
  foldedBranches: [],
  publishPackage: { title: "Finished", body: "Ready", hashtags: ["#AI"], imagePrompt: "Tree" }
};

const activeState = {
  ...finishedState,
  session: { ...finishedState.session, status: "active" },
  enabledSkillIds: ["system-analysis"],
  enabledSkills: [skills[0]],
  publishPackage: null
};

const socialPostArtifact: Artifact = {
  id: "artifact-1",
  type: "social-post",
  version: 1,
  payload: { title: "Finished", body: "Ready", hashtags: ["#AI"], imagePrompt: "Tree" },
  sourceArtifactIds: [],
  createdByNodeId: "node-1",
  createdAt: "2026-04-24T00:00:00.000Z",
  updatedAt: "2026-04-24T00:00:00.000Z"
};

const prdArtifact: Artifact = {
  id: "artifact-prd",
  type: "prd",
  version: 1,
  payload: { markdown: "# PRD\n\nReady" },
  sourceArtifactIds: [],
  createdByNodeId: "node-prd",
  createdAt: "2026-04-24T00:00:00.000Z",
  updatedAt: "2026-04-24T00:00:00.000Z"
};

const generatedArtifact: Artifact = {
  id: "artifact-2",
  type: "social-post",
  version: 1,
  payload: { title: "Generated", body: "Generated body", hashtags: ["#AI"], imagePrompt: "Tree" },
  sourceArtifactIds: ["artifact-1"],
  createdByNodeId: "node-2",
  createdAt: "2026-04-24T00:01:00.000Z",
  updatedAt: "2026-04-24T00:01:00.000Z"
};

function artifactState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    rootMemory,
    session: {
      id: "session-1",
      title: "Artifact session",
      status: "active",
      artifactTypeId: "social-post",
      currentNodeId: "node-1",
      createdAt: "2026-04-24T00:00:00.000Z",
      updatedAt: "2026-04-24T00:00:00.000Z"
    },
    currentNode: {
      id: "node-1",
      sessionId: "session-1",
      parentId: null,
      kind: "artifact",
      producedArtifactId: "artifact-1",
      sourceArtifactIds: [],
      roundIndex: 1,
      roundIntent: "Finish",
      options: [
        { id: "a", label: "A", description: "A", impact: "A", kind: "finish" },
        { id: "b", label: "B", description: "B", impact: "B", kind: "finish" },
        { id: "c", label: "C", description: "C", impact: "C", kind: "finish" }
      ],
      selectedOptionId: null,
      foldedOptions: [],
      agentMessages: [],
      createdAt: "2026-04-24T00:00:00.000Z"
    },
    currentArtifact: socialPostArtifact,
    artifacts: [socialPostArtifact],
    nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
    selectedPath: [],
    foldedBranches: [],
    enabledSkillIds: ["system-analysis"],
    enabledSkills: [skills[0]],
    ...overrides
  };
}

function ndjsonResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      }
    }),
    json: async () => {
      throw new Error("stream response should not call json");
    }
  };
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: async () => data
  };
}

function optionsNdjsonResponse(state: unknown) {
  return ndjsonResponse([`${JSON.stringify({ type: "done", state })}\n`]);
}

function controlledNdjsonResponse() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  return {
    response: {
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        }
      }),
      json: async () => {
        throw new Error("stream response should not call json");
      }
    },
    push(value: unknown) {
      if (!controller) throw new Error("stream controller is not ready");
      controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    close() {
      controller?.close();
    }
  };
}

function installViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const matches = query === "(max-width: 980px)" ? width <= 980 : false;
      const listeners = new Set<(event: MediaQueryListEvent) => void>();
      const mediaQueryList = {
        matches,
        media: query,
        onchange: null,
        addEventListener: (_event: "change", listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_event: "change", listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
        dispatchEvent: (event: Event) => {
          listeners.forEach((listener) => listener(event as MediaQueryListEvent));
          return true;
        }
      };

      return mediaQueryList as MediaQueryList;
    })
  );
}

function installMobileViewport() {
  installViewport(390);
}

function installDesktopViewport() {
  installViewport(1280);
}

describe("TreeableApp", () => {
  afterEach(() => {
    liveDraftMock.mockClear();
    treeCanvasMock.mockClear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens the latest existing tree when a saved seed is loaded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByText("Seed：我想写 AI 产品经理的真实困境")).toBeInTheDocument();
    expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("choices enabled");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions");
    expect(screen.queryByLabelText("历史路径地图")).not.toBeInTheDocument();
  });

  it("passes all session artifacts into the artifact workspace", async () => {
    const state = artifactState({
      artifacts: [socialPostArtifact, prdArtifact],
      nodeArtifacts: [
        { nodeId: "node-1", artifact: socialPostArtifact },
        { nodeId: "node-prd", artifact: prdArtifact }
      ]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("artifact-workspace")).toBeInTheDocument();
    expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        artifacts: state.artifacts,
        selectedArtifactId: "artifact-1"
      })
    );
  });

  it("lets the user select a different artifact in the workspace", async () => {
    const state = artifactState({
      artifacts: [socialPostArtifact, prdArtifact],
      nodeArtifacts: [
        { nodeId: "node-1", artifact: socialPostArtifact },
        { nodeId: "node-prd", artifact: prdArtifact }
      ]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("artifact-workspace")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "select artifact-prd" }));

    expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selectedArtifactId: "artifact-prd"
      })
    );
  });

  it("runs artifact actions from the selected artifact node", async () => {
    const analysisNode = {
      ...artifactState().currentNode!,
      id: "node-analysis",
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "Analyze",
      options: []
    };
    const state = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-analysis" },
      currentNode: analysisNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, analysisNode]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: artifactState() }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("artifact-workspace")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "artifact action" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/artifact/actions/rewrite-selection",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string)).toEqual({
      nodeId: "node-1",
      artifactId: "artifact-1"
    });
  });

  it("saves artifact edits from the selected artifact node", async () => {
    const analysisNode = {
      ...artifactState().currentNode!,
      id: "node-analysis",
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "Analyze",
      options: []
    };
    const state = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-analysis" },
      currentNode: analysisNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, analysisNode]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: artifactState() }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("artifact-workspace")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "save artifact" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/artifact",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(JSON.parse((fetchMock.mock.calls[3][1] as RequestInit).body as string)).toEqual({
      nodeId: "node-1",
      artifact: {
        type: "social-post",
        payload: socialPostArtifact.payload,
        sourceArtifactIds: socialPostArtifact.sourceArtifactIds
      }
    });
  });

  it("keeps the selected artifact when the selected node produced no artifact", async () => {
    const analysisNode = {
      ...artifactState().currentNode!,
      id: "node-analysis",
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "Analyze",
      options: []
    };
    const state = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-analysis" },
      currentNode: analysisNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, analysisNode]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("artifact-workspace")).toBeInTheDocument();
    expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        artifacts: [socialPostArtifact],
        selectedArtifactId: "artifact-1"
      })
    );
  });

  it("reads artifact.replace stream events and selects the streamed artifact", async () => {
    const artifactStream = controlledNdjsonResponse();
    const childNode = {
      ...artifactState().currentNode!,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "A",
      options: []
    };
    const chosenState = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, childNode]
    });
    const finalState = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-2" },
      currentNode: {
        ...childNode,
        kind: "artifact",
        producedArtifactId: "artifact-2",
        options: artifactState().currentNode!.options
      },
      currentArtifact: generatedArtifact,
      artifacts: [socialPostArtifact, generatedArtifact],
      nodeArtifacts: [
        { nodeId: "node-1", artifact: socialPostArtifact },
        { nodeId: "node-2", artifact: generatedArtifact }
      ],
      selectedPath: [
        artifactState().currentNode!,
        { ...childNode, kind: "artifact", producedArtifactId: "artifact-2", options: artifactState().currentNode!.options }
      ]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: artifactState() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(artifactStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/artifact/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    act(() => {
      artifactStream.push({ type: "artifact.replace", artifact: finalState.currentArtifact });
      artifactStream.push({ type: "done", state: finalState });
      artifactStream.close();
    });

    await vi.waitFor(() => {
      expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          artifacts: [socialPostArtifact, generatedArtifact],
          selectedArtifactId: "artifact-2"
        })
      );
    });
  });

  it("selects the current artifact from a done state even when no artifact.replace event was streamed", async () => {
    const artifactStream = controlledNdjsonResponse();
    const childNode = {
      ...artifactState().currentNode!,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "A",
      options: []
    };
    const chosenState = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, childNode]
    });
    const finalState = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-2" },
      currentNode: {
        ...childNode,
        kind: "artifact",
        producedArtifactId: "artifact-2",
        options: artifactState().currentNode!.options
      },
      currentArtifact: generatedArtifact,
      artifacts: [socialPostArtifact, generatedArtifact],
      nodeArtifacts: [
        { nodeId: "node-1", artifact: socialPostArtifact },
        { nodeId: "node-2", artifact: generatedArtifact }
      ],
      selectedPath: [
        artifactState().currentNode!,
        { ...childNode, kind: "artifact", producedArtifactId: "artifact-2", options: artifactState().currentNode!.options }
      ]
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: artifactState() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(artifactStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/sessions/session-1/artifact/generate/stream", expect.anything());
    });

    act(() => {
      artifactStream.push({ type: "done", state: finalState });
      artifactStream.close();
    });

    await vi.waitFor(() => {
      expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          selectedArtifactId: "artifact-2"
        })
      );
    });
  });

  it("passes the displayed streaming node state into the artifact workspace", async () => {
    const artifactStream = controlledNdjsonResponse();
    const childNode = {
      ...artifactState().currentNode!,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      kind: "analysis" as const,
      producedArtifactId: null,
      sourceArtifactIds: ["artifact-1"],
      roundIndex: 2,
      roundIntent: "A",
      options: []
    };
    const chosenState = artifactState({
      session: { ...artifactState().session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentArtifact: null,
      artifacts: [socialPostArtifact],
      nodeArtifacts: [{ nodeId: "node-1", artifact: socialPostArtifact }],
      selectedPath: [artifactState().currentNode!, childNode]
    });
    const streamedOptions = [
      { id: "a" as const, label: "继续", description: "继续", impact: "继续", kind: "deepen" as const },
      { id: "b" as const, label: "换角度", description: "换角度", impact: "换角度", kind: "reframe" as const },
      { id: "c" as const, label: "完成", description: "完成", impact: "完成", kind: "finish" as const }
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: artifactState() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(artifactStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/sessions/session-1/artifact/generate/stream", expect.anything());
    });

    act(() => {
      artifactStream.push({ type: "options", nodeId: "node-2", roundIntent: "流式选项", options: streamedOptions });
    });

    await vi.waitFor(() => {
      expect(artifactWorkspaceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          currentNode: expect.objectContaining({
            id: "node-2",
            options: streamedOptions
          })
        })
      );
    });

    act(() => {
      artifactStream.push({ type: "done", state: chosenState });
      artifactStream.close();
    });
  });

  it("opens the requested draft when an initial session id is provided", async () => {
    const requestedState = {
      ...activeState,
      session: { ...activeState.session, id: "session deep/link", title: "Deep Link" }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: requestedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp initialSessionId="session deep/link" />);

    expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("choices enabled");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions/session%20deep%2Flink");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sessions");
  });

  it("opens the requested draft even when the current root memory has no seed", async () => {
    const requestedRootMemory = {
      ...rootMemory,
      preferences: {
        ...rootMemory.preferences,
        seed: "深链里的旧念头"
      },
      summary: "Seed：深链里的旧念头"
    };
    const requestedState = {
      ...activeState,
      rootMemory: requestedRootMemory,
      session: { ...activeState.session, id: "session-1", title: "Deep Link" }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: requestedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp initialSessionId="session-1" />);

    expect(await screen.findByText("Seed：深链里的旧念头")).toBeInTheDocument();
    expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("choices enabled");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions/session-1");
  });

  it("starts a blank draft setup when requested without loading an existing session", async () => {
    const rootMemoryWithRequest = {
      ...rootMemory,
      preferences: {
        ...rootMemory.preferences,
        creationRequest: "复用旧要求"
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: rootMemoryWithRequest }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    expect(screen.getByText("未启用技能")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "展开自定义创作要求" }));
    expect(screen.getByRole("textbox", { name: "自定义创作要求" })).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=social-post");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sessions");
  });

  it("loads inspirations for a blank draft setup and lets the user fill the seed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inspirations: [
            {
              id: "idea-1",
              title: "AI 产品真实困境",
              detail: "我想写 AI 产品经理在真实项目里的困境。"
            }
          ]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    const seed = await screen.findByRole("textbox", { name: "创作 seed" });
    await userEvent.click(await screen.findByRole("button", { name: "AI 产品真实困境" }));

    expect(seed).toHaveValue("我想写 AI 产品经理在真实项目里的困境。");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=social-post");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/sessions");
  });

  it("reloads inspirations when the user switches artifact type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills, artifactTypes: listArtifactTypes() }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inspirations: [{ id: "social-idea", title: "社媒灵感", detail: "写一条社媒内容。", artifactTypeIds: ["social-post"] }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inspirations: [{ id: "prd-idea", title: "PRD 灵感", detail: "写一份 PRD。", artifactTypeIds: ["prd"] }]
        })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("button", { name: "社媒灵感" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "PRD 文档" }));

    expect(await screen.findByRole("button", { name: "PRD 灵感" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "社媒灵感" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=social-post");
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/inspirations?artifactTypeId=prd");
  });

  it("uses the single configured artifact type without showing artifact choices", async () => {
    const prdArtifactTypes = listArtifactTypes().filter((artifactType) => artifactType.id === "prd");
    const onSubmitState = {
      ...rootMemory,
      preferences: {
        ...rootMemory.preferences,
        artifactTypeId: "prd",
        seed: "移动端草稿管理"
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills, artifactTypes: prdArtifactTypes }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inspirations: [{ id: "prd-idea", title: "PRD 灵感", detail: "写一份 PRD。", artifactTypeIds: ["prd"] }]
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: onSubmitState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: { ...finishedState, rootMemory: onSubmitState } }) })
      .mockResolvedValueOnce(optionsNdjsonResponse({ ...finishedState, rootMemory: onSubmitState }));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("button", { name: "PRD 灵感" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "作品类型" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "创作 seed" }), "移动端草稿管理");
    await userEvent.click(screen.getByRole("button", { name: "用这个念头开始" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=prd");
      expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/root-memory", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toEqual(
        expect.objectContaining({ artifactTypeId: "prd", seed: "移动端草稿管理" })
      );
    });
  });

  it("keeps the blank draft setup available when inspiration loading fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "灵感加载失败。" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    expect(screen.queryByRole("group", { name: "灵感列表" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=social-post");
  });

  it("passes external style generation availability to the blank seed setup", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          skills,
          styleProfile: { externalStyleGenerationAvailable: true }
        })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("button", { name: "一键生成我的风格" })).toBeInTheDocument();
  });

  it("falls back to blank seed setup when the requested draft cannot be opened", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "not found" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp initialSessionId="archived-session" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("草稿不存在或已归档。");
    expect(screen.getByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    expect(screen.getByText("未启用技能")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions/archived-session");
  });

  it("clears a failed deep-link message when starting a new blank draft", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "not found" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<TreeableApp initialSessionId="missing-session" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("草稿不存在或已归档。");
    rerender(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("ignores stale latest-session loads after switching to a blank draft setup", async () => {
    let resolveLatestSession: (response: { ok: boolean; json: () => Promise<{ state: typeof finishedState }> }) => void =
      () => {};
    const delayedLatestSession = new Promise<{ ok: boolean; json: () => Promise<{ state: typeof finishedState }> }>(
      (resolve) => {
        resolveLatestSession = resolve;
      }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockReturnValueOnce(delayedLatestSession)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<TreeableApp />);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions");
    });
    rerender(<TreeableApp startNewDraft />);

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    await act(async () => {
      resolveLatestSession({ ok: true, json: async () => ({ state: finishedState }) });
      await Promise.resolve();
    });

    expect(screen.getByRole("textbox", { name: "创作 seed" })).toHaveValue("");
    expect(screen.queryByTestId("tree-canvas")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("renders mobile draft and options together with the tree collapsed by default", async () => {
    installMobileViewport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("live-draft")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "移动端主面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("tree-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-display")).toHaveTextContent("options");
    expect(screen.queryByRole("region", { name: "移动端树图" })).not.toBeInTheDocument();
    expect(document.querySelector(".mobile-panel--draft")).toHaveClass("mobile-panel--unified");
  });

  it("expands the mobile tree from the unified draft screen", async () => {
    installMobileViewport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("live-draft");
    await userEvent.click(screen.getByRole("button", { name: "展开树图" }));

    expect(screen.getByRole("button", { name: "收起树图" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "移动端树图" })).toBeInTheDocument();
    expect(screen.getAllByTestId("canvas-display").map((item) => item.textContent)).toEqual(["tree", "options"]);

    await userEvent.click(screen.getByRole("button", { name: "收起树图" }));

    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "移动端树图" })).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-display")).toHaveTextContent("options");
  });

  it("does not render mobile panel controls on desktop", async () => {
    installDesktopViewport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("tree-canvas")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "移动端主面板" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开树图" })).not.toBeInTheDocument();
    expect(screen.getByTestId("live-draft")).toBeInTheDocument();
  });

  it("defines mobile-only unified workspace visibility rules", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const defaultPanelRule = css.match(/\.mobile-panel\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const mediaRule = css.match(/@media \(max-width: 980px\)\s*\{(?<body>[\s\S]+?)@media \(max-width: 640px\)/)
      ?.groups?.body ?? "";

    expect(defaultPanelRule).toContain("display: contents");
    expect(mediaRule).toContain(".mobile-tree-toggle");
    expect(mediaRule).toContain(".mobile-panel--draft");
    expect(mediaRule).toContain(".mobile-panel--tree");
    expect(mediaRule).toContain(".mobile-draft-region");
    expect(mediaRule).toContain(".mobile-options-region");
    expect(mediaRule).toContain(".draft-panel__scroll");
    expect(mediaRule).toContain(".mobile-module--generating");
    expect(mediaRule).toContain("@keyframes mobile-module-glow");
    expect(mediaRule).toContain("overflow-y: visible");
    expect(mediaRule).toContain("overscroll-behavior: auto");
    expect(mediaRule).not.toContain("conic-gradient");
    expect(mediaRule).not.toContain("mask-composite");
    expect(mediaRule).not.toContain("transform: rotate");
    expect(mediaRule).toContain("display: grid");
    expect(mediaRule).toContain("grid-auto-rows: auto");
    expect(mediaRule).toContain("align-content: start");
    expect(mediaRule).not.toContain("grid-template-rows: auto auto minmax(0, 1fr)");
  });

  it("keeps the narrow mobile topbar compact instead of stacking boxed rows", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const narrowMobileRule = css.match(/@media \(max-width: 640px\)\s*\{(?<body>[\s\S]+)\}\s*$/)?.groups?.body ?? "";
    const topbarRule = narrowMobileRule.match(/\.topbar\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const topbarActionsRule = narrowMobileRule.match(/\.topbar-actions\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const accountControlsRule = narrowMobileRule.match(/\.account-controls\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const workspaceActionsRule = narrowMobileRule.match(/\.workspace-actions\s*\{(?<body>[^}]+)\}/)?.groups?.body ?? "";
    const workspaceButtonsRule =
      narrowMobileRule.match(/\.workspace-actions \.start-button,\s*\.workspace-actions \.secondary-button\s*\{(?<body>[^}]+)\}/)
        ?.groups?.body ?? "";

    expect(topbarRule).toContain("grid-template-columns: 36px minmax(0, 1fr) auto");
    expect(topbarActionsRule).toContain("display: contents");
    expect(accountControlsRule).toContain("grid-column: 3");
    expect(accountControlsRule).toContain("grid-row: 1");
    expect(workspaceActionsRule).toContain("display: grid");
    expect(workspaceActionsRule).toContain("grid-column: 1 / -1");
    expect(workspaceActionsRule).toContain("grid-row: 2");
    expect(workspaceActionsRule).toContain("grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr) minmax(0, 1fr)");
    expect(workspaceButtonsRule).toContain("min-width: 0");
    expect(workspaceButtonsRule).toContain("min-height: 40px");
  });

  it("trims persisted root summary before flattening it in the topbar", async () => {
    const rootMemoryWithPaddedSummary = {
      ...rootMemory,
      summary: [
        "",
        "  Seed：我想写 AI 产品经理的真实困境  ",
        "  本次创作要求：改成英文的  ",
        ""
      ].join("\n")
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: rootMemoryWithPaddedSummary }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    const topbar = await screen.findByText("Seed：我想写 AI 产品经理的真实困境 | 本次创作要求：改成英文的");
    expect(topbar).toBeInTheDocument();
    expect(topbar).toHaveTextContent(/^Seed：我想写 AI 产品经理的真实困境 \| 本次创作要求：改成英文的$/);
  });

  describe("account controls", () => {
    it("shows the admin account controls for the current user", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <TreeableApp
          currentUser={{
            id: "user-1",
            username: "awei",
            displayName: "Awei",
            role: "admin",
            isAdmin: true
          }}
        />
      );

      expect(await screen.findByText("Awei")).toBeInTheDocument();
      const accountActions = screen.getByRole("group", { name: "账号操作" });
      const workspaceActions = screen.getByRole("group", { name: "作品操作" });
      expect(within(accountActions).getByText("Awei")).toBeInTheDocument();
      expect(within(accountActions).getByRole("link", { name: "用户管理" })).toHaveAttribute("href", "/admin/users");
      expect(within(accountActions).getByRole("link", { name: "用户管理" })).toHaveClass("account-controls__admin-link");
      expect(within(accountActions).getByRole("button", { name: "退出登录" })).toBeInTheDocument();
      expect(within(workspaceActions).getByRole("button", { name: "新念头" })).toBeInTheDocument();
      expect(within(workspaceActions).getByRole("button", { name: "重新开始" })).toBeInTheDocument();
      expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("choices enabled");
    });

    it("collapses mobile account actions into a small top-right menu", async () => {
      installMobileViewport();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <TreeableApp
          currentUser={{
            id: "user-1",
            username: "awei",
            displayName: "Awei",
            role: "admin",
            isAdmin: true
          }}
        />
      );

      const accountActions = await screen.findByRole("group", { name: "账号操作" });
      const accountToggle = await within(accountActions).findByRole("button", { name: "账号：Awei" });

      expect(accountToggle).toHaveClass("account-controls__menu-button");
      expect(within(accountActions).queryByRole("link", { name: "用户管理" })).not.toBeInTheDocument();
      expect(within(accountActions).queryByRole("button", { name: "退出登录" })).not.toBeInTheDocument();

      await userEvent.click(accountToggle);

      expect(within(accountActions).getByRole("link", { name: "用户管理" })).toHaveAttribute("href", "/admin/users");
      expect(within(accountActions).getByRole("button", { name: "退出登录" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "作品操作" })).toBeInTheDocument();
    });

    it("shows a draft library link for logged-in users", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <TreeableApp
          currentUser={{
            id: "user-2",
            username: "xiaolin",
            displayName: "Xiaolin",
            role: "member",
            isAdmin: false
          }}
        />
      );

      const workspaceActions = await screen.findByRole("group", { name: "作品操作" });
      expect(within(workspaceActions).getByRole("link", { name: "我的草稿" })).toHaveAttribute("href", "/drafts");
      expect(within(workspaceActions).getByRole("link", { name: "我的草稿" })).toHaveClass("secondary-button");
    });

    it("signs out to the login page", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <TreeableApp
          currentUser={{
            id: "user-1",
            username: "awei",
            displayName: "Awei",
            role: "admin",
            isAdmin: true
          }}
        />
      );

      await userEvent.click(await screen.findByRole("button", { name: "退出登录" }));

      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });

    it("hides the admin link from member users", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) });
      vi.stubGlobal("fetch", fetchMock);

      render(
        <TreeableApp
          currentUser={{
            id: "user-2",
            username: "xiaolin",
            displayName: "Xiaolin",
            role: "member",
            isAdmin: false
          }}
        />
      );

      expect(await screen.findByText("Xiaolin")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "用户管理" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    });
  });

  it("opens the seed screen when no existing tree is available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: null }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/sessions");
  });

  it("starts the first generation immediately after the seed is saved", async () => {
    const createdState = {
      ...finishedState,
      currentNode: { ...finishedState.currentNode, options: [] },
      selectedPath: [],
      treeNodes: []
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rootMemory: {
            ...rootMemory,
            preferences: {
              ...rootMemory.preferences,
              creationRequest: "改成英文的，保留口语感"
            },
            summary: [
              "Seed：我想写 AI 产品经理的真实困境",
              "本次创作要求：改成英文的，保留口语感"
            ].join("\n")
          }
        })
      })
      .mockResolvedValueOnce(jsonResponse({ state: createdState }))
      .mockResolvedValueOnce(optionsNdjsonResponse(finishedState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.type(await screen.findByRole("textbox", { name: "创作 seed" }), "我想写 AI 产品经理的真实困境");
    await userEvent.click(screen.getByRole("button", { name: "展开自定义创作要求" }));
    await userEvent.type(screen.getByRole("textbox", { name: "自定义创作要求" }), "改成英文的，保留口语感");
    await userEvent.click(screen.getByRole("button", { name: "用这个念头开始" }));

    expect(await screen.findByText(/Seed：我想写 AI 产品经理的真实困境/)).toBeInTheDocument();
    expect(await screen.findByText(/本次创作要求：改成英文的/)).toBeInTheDocument();
    expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("choices enabled");
    expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/inspirations?artifactTypeId=social-post");
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/root-memory", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).toEqual(
      expect.objectContaining({
        seed: "我想写 AI 产品经理的真实困境",
        creationRequest: "改成英文的，保留口语感"
      })
    );
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).not.toHaveProperty("initialOptionId");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string)).not.toHaveProperty("initialOptionMode");
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/sessions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[4][1].body as string).enabledSkillIds).toEqual(["system-analysis"]);
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/sessions/session-1/options", expect.objectContaining({ method: "POST" }));
  });

  it("lets the user start over with a new seed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: finishedState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByText("Seed：我想写 AI 产品经理的真实困境")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "新念头" }));

    expect(await screen.findByRole("textbox", { name: "创作 seed" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "返回当前作品" }));

    expect(await screen.findByTestId("tree-canvas")).toBeInTheDocument();
    expect(screen.getByText("Seed：我想写 AI 产品经理的真实困境")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/inspirations?artifactTypeId=social-post");
  });

  it("restarts from the seed screen with the current seed and skills preselected", async () => {
    const rootMemoryWithRequest = {
      ...rootMemory,
      preferences: {
        ...rootMemory.preferences,
        creationRequest: "从产品实践者视角写，改成英文的"
      },
      summary: [
        "Seed：我想写 AI 产品经理的真实困境",
        "本次创作要求：从产品实践者视角写，改成英文的"
      ].join("\n")
    };
    const currentSettingsState = {
      ...activeState,
      enabledSkillIds: ["system-no-hype-title"],
      enabledSkills: [skills[1]]
    };
    const createdState = {
      ...currentSettingsState,
      currentNode: { ...currentSettingsState.currentNode, options: [] },
      selectedPath: [],
      treeNodes: []
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory: rootMemoryWithRequest }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: currentSettingsState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inspirations: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce(jsonResponse({ state: createdState }))
      .mockResolvedValueOnce(optionsNdjsonResponse(currentSettingsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByText(/Seed：我想写 AI 产品经理的真实困境/)).toBeInTheDocument();
    await userEvent.click(within(document.querySelector(".topbar") as HTMLElement).getByRole("button", { name: "重新开始" }));

    expect(screen.getByRole("textbox", { name: "创作 seed" })).toHaveValue("我想写 AI 产品经理的真实困境");
    expect(screen.queryByRole("textbox", { name: "自定义创作要求" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "展开自定义创作要求" }));
    expect(screen.getByRole("textbox", { name: "自定义创作要求" })).toHaveValue("从产品实践者视角写，改成英文的");
    expect(screen.queryByRole("button", { name: "找表达角度" })).not.toBeInTheDocument();
    expect(screen.getByText("标题不要夸张")).toBeInTheDocument();
    expect(screen.queryByText("分析")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/inspirations?artifactTypeId=social-post");

    await userEvent.click(screen.getByRole("button", { name: "用这个念头开始" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/root-memory", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(fetchMock.mock.calls[4][1].body as string)).toEqual(
        expect.objectContaining({ seed: "我想写 AI 产品经理的真实困境" })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/sessions", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(fetchMock.mock.calls[5][1].body as string).enabledSkillIds).toEqual(["system-no-hype-title"]);
      expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/sessions/session-1/options", expect.objectContaining({ method: "POST" }));
    });
  });

  it("passes the parent node draft to the live draft panel", async () => {
    const parentNode = {
      ...finishedState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      selectedOptionId: "a" as const
    };
    const currentNode = {
      ...finishedState.currentNode,
      id: "node-2",
      parentId: "node-1",
      roundIndex: 2
    };
    const state = {
      ...finishedState,
      session: { ...finishedState.session, status: "active" as const, currentNodeId: "node-2" },
      currentNode,
      currentDraft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "Parent", body: "Parent body", hashtags: ["#parent"], imagePrompt: "Parent image" } },
        { nodeId: "node-2", draft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" } }
      ],
      selectedPath: [parentNode, currentNode],
      publishPackage: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("live-draft")).toBeInTheDocument();
    expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ previousDraft: state.nodeDrafts[0].draft }));
  });

  it("passes edited node ids to the tree canvas when drafts differ from their parent", async () => {
    const firstNode = {
      ...finishedState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      selectedOptionId: "a" as const
    };
    const changedNode = {
      ...finishedState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2
    };
    const unchangedSibling = {
      ...finishedState.currentNode,
      id: "node-3",
      parentId: "node-1",
      parentOptionId: "b" as const,
      roundIndex: 2
    };
    const parentDraft = { title: "Base", body: "Base body", hashtags: ["#base"], imagePrompt: "Base image" };
    const state = {
      ...finishedState,
      session: { ...finishedState.session, status: "active" as const, currentNodeId: "node-2" },
      currentNode: changedNode,
      currentDraft: { title: "Changed", body: "Changed body", hashtags: ["#changed"], imagePrompt: "Changed image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: parentDraft },
        { nodeId: "node-2", draft: { title: "Changed", body: "Changed body", hashtags: ["#changed"], imagePrompt: "Changed image" } },
        { nodeId: "node-3", draft: parentDraft }
      ],
      selectedPath: [firstNode, changedNode],
      treeNodes: [firstNode, changedNode, unchangedSibling],
      publishPackage: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("tree-canvas")).toBeInTheDocument();
    expect(treeCanvasMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changedDraftNodeIds: ["node-2"]
      })
    );
  });

  it("selects two clicked tree nodes as an arbitrary draft comparison", async () => {
    const firstNode = {
      ...finishedState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      selectedOptionId: "a" as const
    };
    const secondNode = {
      ...finishedState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2
    };
    const siblingNode = {
      ...finishedState.currentNode,
      id: "node-3",
      parentId: "node-1",
      parentOptionId: "b" as const,
      roundIndex: 2
    };
    const state = {
      ...finishedState,
      session: { ...finishedState.session, status: "active" as const, currentNodeId: "node-2" },
      currentNode: secondNode,
      currentDraft: { title: "Second", body: "Second body", hashtags: ["#second"], imagePrompt: "Second image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "First", body: "First body", hashtags: ["#first"], imagePrompt: "First image" } },
        { nodeId: "node-2", draft: { title: "Second", body: "Second body", hashtags: ["#second"], imagePrompt: "Second image" } },
        { nodeId: "node-3", draft: { title: "Sibling", body: "Sibling body", hashtags: ["#sibling"], imagePrompt: "Sibling image" } }
      ],
      selectedPath: [firstNode, secondNode],
      treeNodes: [firstNode, secondNode, siblingNode],
      publishPackage: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("live-draft")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "start comparison" }));
    expect(await screen.findByTestId("tree-canvas")).toHaveTextContent("comparison mode");
    expect(treeCanvasMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        comparisonNodeIds: { fromNodeId: "node-1", toNodeId: "node-2" }
      })
    );
    expect(liveDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        comparisonDrafts: {
          from: state.nodeDrafts[0].draft,
          to: state.nodeDrafts[1].draft
        },
        comparisonSelectionCount: 2,
        isComparisonMode: true
      })
    );

    await userEvent.click(screen.getByRole("button", { name: "select comparison node 3" }));
    expect(liveDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        comparisonDrafts: {
          from: state.nodeDrafts[2].draft,
          to: state.nodeDrafts[1].draft
        },
        comparisonLabels: expect.objectContaining({
          from: expect.stringContaining("第 2 轮"),
          to: expect.stringContaining("第 2 轮")
        }),
        comparisonSelectionCount: 2,
        isComparisonMode: true
      })
    );

    await userEvent.click(screen.getByRole("button", { name: "select comparison node 1" }));
    expect(liveDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        comparisonDrafts: {
          from: state.nodeDrafts[0].draft,
          to: state.nodeDrafts[1].draft
        },
        comparisonLabels: expect.objectContaining({
          from: expect.stringContaining("第 1 轮"),
          to: expect.stringContaining("第 2 轮")
        }),
        comparisonSelectionCount: 2,
        isComparisonMode: true
      })
    );
  });

  it("requests a historical branch when the tree asks to activate one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "activate historical branch" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/sessions/session-1/branch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nodeId: "node-1", optionId: "a", optionMode: "balanced" })
      })
    );
  });

  it("keeps a mobile direction choice in the unified draft and options workspace", async () => {
    installMobileViewport();
    const childNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2,
      options: [],
      selectedOptionId: null
    };
    const chosenState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentDraft: activeState.currentDraft,
      nodeDrafts: [{ nodeId: "node-1", draft: activeState.currentDraft }],
      selectedPath: [activeState.currentNode, childNode]
    };
    const generatedState = {
      ...chosenState,
      currentDraft: { title: "Generated", body: "Generated body", hashtags: ["#AI"], imagePrompt: "Tree" },
      nodeDrafts: [
        { nodeId: "node-1", draft: activeState.currentDraft },
        { nodeId: "node-2", draft: { title: "Generated", body: "Generated body", hashtags: ["#AI"], imagePrompt: "Tree" } }
      ]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(generatedState))
      .mockResolvedValueOnce(optionsNdjsonResponse(generatedState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ draft: generatedState.currentDraft })
      );
    });
    expect(screen.queryByRole("group", { name: "移动端主面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".mobile-panel--draft")).toHaveClass("mobile-panel--unified");
  });

  it("keeps next options generation in the mobile unified workspace without tab badges", async () => {
    installMobileViewport();
    const scrollIntoView = vi.fn();
    const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const draftStream = controlledNdjsonResponse();
    const optionsStream = controlledNdjsonResponse();
    const childNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2,
      options: [],
      selectedOptionId: null
    };
    const chosenState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentDraft: null,
      nodeDrafts: [{ nodeId: "node-1", draft: activeState.currentDraft }],
      selectedPath: [activeState.currentNode, childNode]
    };
    const generatedDraft = { title: "Generated", body: "Generated body", hashtags: ["#AI"], imagePrompt: "Tree" };
    const generatedState = {
      ...chosenState,
      currentDraft: generatedDraft,
      nodeDrafts: [
        { nodeId: "node-1", draft: activeState.currentDraft },
        { nodeId: "node-2", draft: generatedDraft }
      ]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(draftStream.response)
      .mockResolvedValueOnce(optionsStream.response);
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    try {
      render(<TreeableApp />);

      expect(await screen.findByRole("button", { name: "展开树图" })).toBeInTheDocument();
      expect(document.querySelector(".mobile-draft-region")).not.toHaveClass("mobile-draft-region--generating");
      expect(document.querySelector(".mobile-options-region")).not.toHaveClass("mobile-options-region--generating");
      await userEvent.click(screen.getByRole("button", { name: "choose displayed option" }));
      await vi.waitFor(() => {
        expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ generationStage: "draft" }));
      });
      expect(document.querySelector(".mobile-draft-region")).toHaveClass("mobile-draft-region--generating");
      expect(document.querySelector(".mobile-options-region")).not.toHaveClass("mobile-options-region--generating");
      await vi.waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
      });
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });

      act(() => {
        draftStream.push({ type: "draft", draft: generatedDraft, streamingField: "body" });
        draftStream.push({ type: "done", state: generatedState });
        draftStream.close();
      });

      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenNthCalledWith(
          6,
          "/api/sessions/session-1/options",
          expect.objectContaining({ method: "POST" })
        );
      });
      expect(document.querySelector(".mobile-draft-region")).not.toHaveClass("mobile-draft-region--generating");
      expect(document.querySelector(".mobile-options-region")).toHaveClass("mobile-options-region--generating");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      expect(screen.queryByRole("group", { name: "移动端主面板" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("region", { name: "移动端树图" })).not.toBeInTheDocument();
    } finally {
      if (scrollIntoViewDescriptor) {
        Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoViewDescriptor);
      } else {
        delete (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView;
      }
    }
  });

  it("keeps the unified workspace visible when a mobile historical branch starts generation", async () => {
    installMobileViewport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByRole("button", { name: "展开树图" });
    await userEvent.click(screen.getByRole("button", { name: "展开树图" }));
    await userEvent.click(screen.getByRole("button", { name: "activate historical branch" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/branch",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(screen.getByTestId("live-draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起树图" })).toHaveAttribute("aria-expanded", "true");
  });

  it("regenerates mobile options from the unified workspace without opening the tree", async () => {
    installMobileViewport();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(activeState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByRole("button", { name: "regenerate focused options" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/options",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "移动端树图" })).not.toBeInTheDocument();
  });

  it("lets the user retry when the current draft is missing next options", async () => {
    const missingOptionsState = {
      ...activeState,
      currentNode: {
        ...activeState.currentNode,
        options: []
      }
    };
    const recoveredOptionsState = {
      ...activeState,
      currentNode: {
        ...activeState.currentNode,
        options: [
          { id: "a", label: "Recovered A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Recovered B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Recovered C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: missingOptionsState }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(recoveredOptionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("tree-canvas");
    expect(treeCanvasMock).toHaveBeenLastCalledWith(expect.objectContaining({ onRegenerateOptions: expect.any(Function) }));
    expect(screen.getByTestId("canvas-options")).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole("button", { name: "regenerate focused options" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-1", optionMode: "focused", force: true })
        })
      );
      expect(screen.getByTestId("canvas-options")).toHaveTextContent("Recovered A|Recovered B|Recovered C");
    });
  });

  it("keeps the expandable tree open when viewing a historical node without generation", async () => {
    installMobileViewport();
    const historicalNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      roundIndex: 2
    };
    const state = {
      ...activeState,
      treeNodes: [activeState.currentNode, historicalNode],
      nodeDrafts: [
        { nodeId: "node-1", draft: activeState.currentDraft },
        { nodeId: "node-2", draft: { title: "History", body: "History body", hashtags: [], imagePrompt: "" } }
      ]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByRole("button", { name: "展开树图" });
    await userEvent.click(screen.getByRole("button", { name: "展开树图" }));
    await userEvent.click(screen.getByRole("button", { name: "view historical node" }));

    expect(screen.getByRole("button", { name: "收起树图" })).toHaveAttribute("aria-expanded", "true");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a manually expanded mobile tree open while draft updates arrive in the unified workspace", async () => {
    installMobileViewport();
    const draftStream = controlledNdjsonResponse();
    const childNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2,
      options: [],
      selectedOptionId: null
    };
    const chosenState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: childNode,
      currentDraft: null,
      nodeDrafts: [{ nodeId: "node-1", draft: activeState.currentDraft }],
      selectedPath: [activeState.currentNode, childNode]
    };
    const generatedDraft = { title: "Generated", body: "Generated body", hashtags: ["#AI"], imagePrompt: "Tree" };
    const generatedState = {
      ...chosenState,
      currentDraft: generatedDraft,
      nodeDrafts: [
        { nodeId: "node-1", draft: activeState.currentDraft },
        { nodeId: "node-2", draft: generatedDraft }
      ]
    };
    const generatedOptionsState = {
      ...generatedState,
      currentNode: {
        ...generatedState.currentNode,
        options: activeState.currentNode.options
      }
    };
    const secondChildNode = {
      ...activeState.currentNode,
      id: "node-3",
      parentId: "node-2",
      parentOptionId: "a" as const,
      roundIndex: 3,
      options: [],
      selectedOptionId: null
    };
    const secondChosenState = {
      ...generatedOptionsState,
      session: { ...generatedOptionsState.session, currentNodeId: "node-3" },
      currentNode: secondChildNode,
      currentDraft: null,
      selectedPath: [activeState.currentNode, childNode, secondChildNode]
    };
    const secondDraft = { title: "Second", body: "Second body", hashtags: ["#AI"], imagePrompt: "Tree" };
    const secondDraftState = {
      ...secondChosenState,
      currentDraft: secondDraft,
      nodeDrafts: [...generatedState.nodeDrafts, { nodeId: "node-3", draft: secondDraft }]
    };
    const secondOptionsState = {
      ...secondDraftState,
      currentNode: {
        ...secondDraftState.currentNode,
        options: activeState.currentNode.options
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: chosenState }) })
      .mockResolvedValueOnce(draftStream.response)
      .mockResolvedValueOnce(optionsNdjsonResponse(generatedOptionsState))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: secondChosenState }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(secondDraftState))
      .mockResolvedValueOnce(optionsNdjsonResponse(secondOptionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByRole("button", { name: "展开树图" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "choose displayed option" }));
    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ generationStage: "draft" }));
    });

    await userEvent.click(screen.getByRole("button", { name: "展开树图" }));
    expect(screen.getByRole("button", { name: "收起树图" })).toHaveAttribute("aria-expanded", "true");

    act(() => {
      draftStream.push({ type: "draft", draft: generatedDraft, streamingField: "body" });
    });

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: generatedDraft }));
    });

    act(() => {
      draftStream.push({ type: "done", state: generatedState });
      draftStream.close();
    });

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: generatedDraft }));
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/options",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getAllByTestId("canvas-options").at(-1)).toHaveTextContent("A|B|C");
    });
    expect(screen.getByRole("button", { name: "收起树图" })).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(screen.getByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        7,
        "/api/sessions/session-1/choose",
        expect.objectContaining({ method: "POST" })
      );
      expect(screen.getByTestId("live-draft")).toBeInTheDocument();
    });
  });

  it("uses the viewed historical node as the source for custom directions", async () => {
    const rootNode = {
      ...activeState.currentNode,
      id: "node-1",
      selectedOptionId: "a" as const,
      foldedOptions: [
        { id: "b", label: "Root B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "Root C", description: "C", impact: "C", kind: "finish" }
      ]
    };
    const historicalNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      parentOptionId: "a" as const,
      roundIndex: 2,
      roundIntent: "Historical",
      options: [
        { id: "a", label: "History A", description: "A", impact: "A", kind: "explore" },
        { id: "b", label: "History B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "History C", description: "C", impact: "C", kind: "finish" }
      ],
      selectedOptionId: "b" as const,
      foldedOptions: [
        { id: "a", label: "History A", description: "A", impact: "A", kind: "explore" },
        { id: "c", label: "History C", description: "C", impact: "C", kind: "finish" }
      ]
    };
    const currentLeaf = {
      ...activeState.currentNode,
      id: "node-3",
      parentId: "node-2",
      parentOptionId: "b" as const,
      roundIndex: 3,
      roundIntent: "Current leaf",
      options: activeState.currentNode.options,
      selectedOptionId: null
    };
    const historicalState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-3" },
      currentNode: currentLeaf,
      currentDraft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "Root", body: "Root body", hashtags: ["#root"], imagePrompt: "Root image" } },
        { nodeId: "node-2", draft: { title: "History", body: "History body", hashtags: ["#history"], imagePrompt: "History image" } },
        { nodeId: "node-3", draft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" } }
      ],
      selectedPath: [rootNode, historicalNode, currentLeaf],
      treeNodes: [rootNode, historicalNode, currentLeaf]
    };
    const customOption = {
      id: "custom-skill",
      label: "润色",
      description: "使用技能「润色」继续。",
      impact: "按当前作品启用技能继续生成。",
      kind: "reframe" as const
    };
    const customChild = {
      ...activeState.currentNode,
      id: "node-4",
      parentId: "node-2",
      parentOptionId: "custom-skill",
      roundIndex: 3,
      roundIntent: "润色",
      options: activeState.currentNode.options
    };
    const customBranchState = {
      ...historicalState,
      session: { ...historicalState.session, currentNodeId: "node-4" },
      currentNode: customChild,
      currentDraft: { title: "Custom", body: "Custom body", hashtags: ["#custom"], imagePrompt: "Custom image" },
      nodeDrafts: [
        ...historicalState.nodeDrafts,
        { nodeId: "node-4", draft: { title: "Custom", body: "Custom body", hashtags: ["#custom"], imagePrompt: "Custom image" } }
      ],
      selectedPath: [
        rootNode,
        {
          ...historicalNode,
          selectedOptionId: "custom-skill",
          options: [...historicalNode.options, customOption],
          foldedOptions: historicalNode.options
        },
        customChild
      ],
      treeNodes: [rootNode, historicalNode, currentLeaf, customChild]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: historicalState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: customBranchState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("tree-canvas");
    await userEvent.click(screen.getByRole("button", { name: "view historical node" }));
    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-current-node")).toHaveTextContent("node-2");
    });

    await userEvent.click(screen.getByRole("button", { name: "use custom skill option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/branch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            nodeId: "node-2",
            optionId: "custom-skill",
            optionMode: "balanced",
            customOption
          })
        })
      );
    });
  });

  it("lets the user manage skills during a creation session", async () => {
    const updatedState = {
      ...activeState,
      enabledSkillIds: ["system-analysis", "system-no-hype-title"],
      enabledSkills: skills
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: updatedState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("canvas-skills")).toHaveTextContent("分析");
    const draftPanel = screen.getByTestId("live-draft");
    expect(within(document.querySelector(".topbar") as HTMLElement).queryByRole("button", { name: "1 个技能" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId("mock-draft-actions")).getByRole("button", { name: "1 个技能" })).toBeInTheDocument();
    await userEvent.click(within(draftPanel).getByRole("button", { name: "1 个技能" }));
    expect(within(draftPanel).getByRole("complementary", { name: "本作品技能" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /标题不要夸张/ }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/skills",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ enabledSkillIds: ["system-analysis", "system-no-hype-title"] })
        })
      );
    });
    expect(await screen.findByText("2 个技能")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-skills")).toHaveTextContent("分析|标题不要夸张");
  });

  it("highlights new thought but keeps restart secondary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByText("Seed：我想写 AI 产品经理的真实困境")).toBeInTheDocument();
    const topbar = document.querySelector(".topbar") as HTMLElement;
    expect(within(topbar).getByRole("button", { name: "新念头" })).toHaveClass("start-button");
    expect(within(topbar).getByRole("button", { name: "重新开始" })).toHaveClass("secondary-button");
    expect(within(topbar).getByRole("button", { name: "重新开始" })).not.toHaveClass("start-button");
  });

  it("lets the user create a global skill from the library", async () => {
    const createdSkill: Skill = {
      id: "user-xhs",
      title: "小红书风格",
      category: "平台",
      description: "适合小红书。",
      prompt: "标题口语一点。",
      appliesTo: "both",
      isSystem: false,
      defaultEnabled: false,
      isArchived: false,
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z"
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skill: createdSkill }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(screen.queryByRole("button", { name: "技能库" })).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "1 个技能" }));
    const skillPanel = screen.getByRole("complementary", { name: "本作品技能" });
    await userEvent.click(within(skillPanel).getByRole("button", { name: "管理技能库" }));
    await userEvent.click(screen.getByRole("button", { name: "新建技能" }));
    await userEvent.type(screen.getByRole("textbox", { name: "技能名称" }), "小红书风格");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "分类" }), "平台");
    await userEvent.type(screen.getByRole("textbox", { name: "说明" }), "适合小红书。");
    await userEvent.type(screen.getByRole("textbox", { name: "提示词" }), "标题口语一点。");
    await userEvent.click(screen.getByRole("button", { name: "保存技能" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/skills",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("小红书风格")
        })
      );
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body as string).appliesTo).toBe("both");
    expect(screen.getByRole("article", { name: "小红书风格" })).toBeInTheDocument();
  });

  it("hides skill repository import controls from member users", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TreeableApp
        currentUser={{
          id: "user-2",
          username: "xiaolin",
          displayName: "Xiaolin",
          role: "member",
          isAdmin: false
        }}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: "1 个技能" }));
    const skillPanel = screen.getByRole("complementary", { name: "本作品技能" });
    await userEvent.click(within(skillPanel).getByRole("button", { name: "管理技能库" }));

    expect(screen.getByRole("complementary", { name: "技能库" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Skill GitHub URL" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入" })).not.toBeInTheDocument();
  });

  it("shows a generated branch draft before requesting missing next options", async () => {
    const draftOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        options: []
      },
      currentDraft: { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" },
      nodeDrafts: [
        ...activeState.nodeDrafts,
        { nodeId: "node-2", draft: { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" } }
      ],
      selectedPath: [activeState.currentNode, { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }]
    };
    const optionsState = {
      ...draftOnlyState,
      currentNode: {
        ...draftOnlyState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    let resolveOptions: (value: unknown) => void = () => {};
    const optionsPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: draftOnlyState }) })
      .mockReturnValueOnce(optionsPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "activate historical branch" }));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: draftOnlyState.currentDraft }));
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    resolveOptions(optionsNdjsonResponse(optionsState));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: optionsState.currentDraft }));
    });
  });

  it("shows a selected child node before generating its draft and options", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" },
      nodeDrafts: [
        ...activeState.nodeDrafts,
        { nodeId: "node-2", draft: { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" } }
      ]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    let resolveDraft: (value: unknown) => void = () => {};
    let resolveOptions: (value: unknown) => void = () => {};
    const draftPromise = new Promise((resolve) => {
      resolveDraft = resolve;
    });
    const optionsPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockReturnValueOnce(draftPromise)
      .mockReturnValueOnce(optionsPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-current-node")).toHaveTextContent("node-2");
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:draft");
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    resolveDraft(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: draftState.currentDraft }));
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:options");
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    resolveOptions(optionsNdjsonResponse(optionsState));

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options")).toHaveTextContent("Next A|Next B|Next C");
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("reveals streamed options one by one without prefilled placeholders", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalDraft = { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const finalOptions = [
      { id: "a", label: "First A", description: "A", impact: "A", kind: "explore" },
      { id: "b", label: "Second B", description: "B", impact: "B", kind: "deepen" },
      { id: "c", label: "Third C", description: "C", impact: "C", kind: "finish" }
    ];
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: finalOptions
      }
    };
    const optionsStream = controlledNdjsonResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]))
      .mockResolvedValueOnce(optionsStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/sessions/session-1/options", expect.anything());
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:options");
      expect(screen.getByTestId("canvas-options")).toBeEmptyDOMElement();
    });

    act(() => {
      optionsStream.push({ type: "thinking", text: "先看当前草稿，再拆一个问题。" });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent(
        "options:thinking:先看当前草稿，再拆一个问题。"
      );
    });
    expect(screen.queryByRole("status", { name: "AI 思考过程" })).not.toBeInTheDocument();

    act(() => {
      optionsStream.push({ type: "thinking", text: "先看当前草稿，再拆一个问题。第二步排除重复答案。" });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent(
        "options:thinking:先看当前草稿，再拆一个问题。第二步排除重复答案。"
      );
    });

    act(() => {
      optionsStream.push({
        type: "options",
        nodeId: "node-2",
        roundIntent: "现在最需要确认哪个体验价值？",
        options: [finalOptions[0]]
      });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("First A");
      expect(screen.getByTestId("canvas-round-intent")).toHaveTextContent("现在最需要确认哪个体验价值？");
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent(
        "options:streaming:先看当前草稿，再拆一个问题。第二步排除重复答案。"
      );
    });

    act(() => {
      optionsStream.push({ type: "options", nodeId: "node-2", options: finalOptions.slice(0, 2) });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("First A|Second B");
    });

    act(() => {
      optionsStream.push({ type: "options", nodeId: "node-2", options: finalOptions });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("First A|Second B|Third C");
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent("options:streaming:");
      expect(screen.getByTestId("live-draft-generation-status")).not.toHaveTextContent("第二步排除重复答案");
    });

    act(() => {
      optionsStream.push({ type: "thinking", text: "结构修复重试，重新判断当前问题。" });
      optionsStream.push({
        type: "options",
        nodeId: "node-2",
        options: [{ ...finalOptions[0], label: "Retry A" }]
      });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("First A|Second B|Third C");
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent("options:streaming:");
      expect(screen.getByTestId("live-draft-generation-status")).not.toHaveTextContent("结构修复重试");
    });

    act(() => {
      optionsStream.push({ type: "done", state: optionsState });
      optionsStream.close();
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("First A|Second B|Third C");
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("moves draft-stream routing thinking to the options area before option text arrives", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalOptions = [
      { id: "a", label: "Route A", description: "A", impact: "A", kind: "explore" },
      { id: "b", label: "Route B", description: "B", impact: "B", kind: "deepen" },
      { id: "c", label: "Route C", description: "C", impact: "C", kind: "finish" }
    ];
    const optionsState = {
      ...nodeOnlyState,
      currentNode: {
        ...nodeOnlyState.currentNode,
        roundIntent: "先补三个问题",
        options: finalOptions
      }
    };
    const draftStream = controlledNdjsonResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(draftStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:draft");
    });

    act(() => {
      draftStream.push({ type: "thinking", nodeId: "node-2", stage: "options", text: "[工具] 正在查找素材" });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:options");
      expect(screen.getByTestId("canvas-options")).toBeEmptyDOMElement();
      expect(screen.getByTestId("live-draft-generation-status")).toHaveTextContent("options:thinking:[工具] 正在查找素材");
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          generationStage: "options",
          isGenerating: false
        })
      );
    });

    act(() => {
      draftStream.push({ type: "options", nodeId: "node-2", roundIntent: "先补三个问题", options: [finalOptions[0]] });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options")).toHaveTextContent("Route A");
    });

    act(() => {
      draftStream.push({ type: "done", state: optionsState });
      draftStream.close();
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("streams regenerated options over an existing option set", async () => {
    const finalOptions = [
      { id: "a", label: "Focused A", description: "A", impact: "A", kind: "deepen" },
      { id: "b", label: "Focused B", description: "B", impact: "B", kind: "explore" },
      { id: "c", label: "Focused C", description: "C", impact: "C", kind: "finish" }
    ];
    const optionsState = {
      ...activeState,
      currentNode: {
        ...activeState.currentNode,
        options: finalOptions
      }
    };
    const optionsStream = controlledNdjsonResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce(optionsStream.response);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("tree-canvas");
    expect(screen.getByTestId("canvas-options").textContent).toBe("A|B|C");

    await userEvent.click(screen.getByRole("button", { name: "regenerate focused options" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-1", optionMode: "focused", force: true })
        })
      );
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-1:options");
      expect(screen.getByTestId("canvas-options")).toBeEmptyDOMElement();
    });

    act(() => {
      optionsStream.push({ type: "options", nodeId: "node-1", options: [finalOptions[0]] });
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("Focused A");
    });

    act(() => {
      optionsStream.push({ type: "done", state: optionsState });
      optionsStream.close();
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-options").textContent).toBe("Focused A|Focused B|Focused C");
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("streams a transient draft diff before applying the final generated state", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalDraft = { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    let resolveOptions: (value: unknown) => void = () => {};
    const optionsPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(
        ndjsonResponse([
          `${JSON.stringify({
            type: "draft",
            streamingField: "imagePrompt",
            draft: { title: "Draft first", body: "Draft body", hashtags: ["#draft"], imagePrompt: "" }
          })}\n`,
          `${JSON.stringify({ type: "done", state: draftState })}\n`
        ])
      )
      .mockReturnValueOnce(optionsPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(
        liveDraftMock.mock.calls.some(([props]) => {
          return (
            props.isLiveDiff === true &&
            props.draft?.title === "Draft first" &&
            props.draft?.body === "Draft body" &&
            props.draft?.hashtags?.length === 1 &&
            props.draft.hashtags[0] === "#draft" &&
            props.draft?.imagePrompt === "" &&
            props.isLiveDiffStreaming === true &&
            props.liveDiffStreamingField === "imagePrompt" &&
            props.previousDraft === activeState.nodeDrafts[0].draft
          );
        })
      ).toBe(true);
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:options");
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: finalDraft,
          isLiveDiff: true,
          isLiveDiffStreaming: false
        })
      );
    });

    resolveOptions(optionsNdjsonResponse(optionsState));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: finalDraft,
          isLiveDiff: true,
          isLiveDiffStreaming: false
        })
      );
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });

    await userEvent.click(screen.getByRole("button", { name: "dismiss generated diff" }));

    await vi.waitFor(() => {
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: finalDraft,
          isLiveDiff: false,
          isLiveDiffStreaming: false
        })
      );
    });
  });

  it("shows the parent draft while waiting for the first streamed draft", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalDraft = { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    let resolveDraft: (value: unknown) => void = () => {};
    let resolveOptions: (value: unknown) => void = () => {};
    const draftPromise = new Promise((resolve) => {
      resolveDraft = resolve;
    });
    const optionsPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockReturnValueOnce(draftPromise)
      .mockReturnValueOnce(optionsPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: activeState.nodeDrafts[0].draft,
          previousDraft: activeState.nodeDrafts[0].draft,
          isLiveDiff: true,
          isLiveDiffStreaming: true
        })
      );
    });

    resolveDraft(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/sessions/session-1/options", expect.anything());
    });

    resolveOptions(optionsNdjsonResponse(optionsState));

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("does not clear a coalesced streaming draft before applying final state", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalDraft = { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    let resolveDraft: (value: unknown) => void = () => {};
    let resolveOptions: (value: unknown) => void = () => {};
    const draftPromise = new Promise((resolve) => {
      resolveDraft = resolve;
    });
    const optionsPromise = new Promise((resolve) => {
      resolveOptions = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockReturnValueOnce(draftPromise)
      .mockReturnValueOnce(optionsPromise);
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    const callsBeforeStreamResolution = liveDraftMock.mock.calls.length;

    let immediateAssertionPassed = false;
    vi.useFakeTimers();
    try {
      await act(async () => {
        resolveDraft(
          ndjsonResponse([
            '{"type":"draft","draft":{"title":"Draft first","body":"Draft body","hashtags":["#draft"],"imagePrompt":""}}\n' +
              `${JSON.stringify({ type: "done", state: draftState })}\n`
          ])
        );

        for (let index = 0; index < 10; index += 1) {
          await Promise.resolve();
        }
      });

      expect(liveDraftMock.mock.calls.at(-1)?.[0].draft).not.toBeNull();

      immediateAssertionPassed = true;
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    } finally {
      if (!immediateAssertionPassed) {
        await act(async () => {
          await vi.runAllTimersAsync();
        });
        resolveOptions(optionsNdjsonResponse(optionsState));
        await act(async () => {
          await vi.runAllTimersAsync();
        });
      }
      vi.useRealTimers();
    }

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("node-2:options");
      expect(liveDraftMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          draft: finalDraft,
          isLiveDiff: true,
          isLiveDiffStreaming: false
        })
      );
    });

    const callsAfterStreamResolution = liveDraftMock.mock.calls.slice(callsBeforeStreamResolution).map(([props]) => props);
    const clearedDraftCall = callsAfterStreamResolution.find((props) => props.draft === null);
    expect(clearedDraftCall).toBeUndefined();

    resolveOptions(optionsNdjsonResponse(optionsState));

    await vi.waitFor(() => {
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("shows a toast retry action after draft generation fails for a draftless current node", async () => {
    installMobileViewport();
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "a" as const,
        roundIndex: 2,
        roundIntent: "A",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: "a" as const, options: [] }
      ]
    };
    const finalDraft = { title: "Retry draft", body: "Retry body", hashtags: ["#retry"], imagePrompt: "retry image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(ndjsonResponse(['{"type":"error","error":"流式生成失败"}\n']))
      .mockResolvedValueOnce(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]))
      .mockResolvedValueOnce(optionsNdjsonResponse(optionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);
    await userEvent.click(await screen.findByRole("button", { name: "choose displayed option" }));

    const failureToast = await screen.findByRole("status");
    expect(failureToast).toHaveTextContent("流式生成失败");
    const retryButton = within(failureToast).getByRole("button", { name: "重试生成" });
    expect(within(screen.getByTestId("mock-draft-actions")).queryByRole("button", { name: "重试生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(retryButton);
    expect(screen.getByRole("button", { name: "展开树图" })).toHaveAttribute("aria-expanded", "false");

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        7,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(liveDraftMock).toHaveBeenLastCalledWith(expect.objectContaining({ draft: finalDraft }));
      expect(screen.getByTestId("canvas-options")).toHaveTextContent("Next A|Next B|Next C");
    });
  });

  it("immediately starts generation when a custom skill direction is picked", async () => {
    const customSkillOption = {
      id: "custom-skill",
      label: "润色",
      description: "使用技能「润色」继续。",
      impact: "按当前作品启用技能继续生成。",
      kind: "reframe" as const
    };
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: customSkillOption.id,
        roundIndex: 2,
        roundIntent: "润色",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        {
          ...activeState.currentNode,
          selectedOptionId: customSkillOption.id,
          options: [...activeState.currentNode.options, customSkillOption]
        },
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: customSkillOption.id, options: [] }
      ],
      treeNodes: [
        activeState.currentNode,
        { ...activeState.currentNode, id: "node-2", parentId: "node-1", parentOptionId: customSkillOption.id, options: [] }
      ]
    };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: { title: "Polished", body: "Polished body", hashtags: ["#draft"], imagePrompt: "draft image" },
      nodeDrafts: [
        ...activeState.nodeDrafts,
        { nodeId: "node-2", draft: { title: "Polished", body: "Polished body", hashtags: ["#draft"], imagePrompt: "draft image" } }
      ]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]))
      .mockResolvedValueOnce(optionsNdjsonResponse(optionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "use custom skill option" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/choose",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            nodeId: "node-1",
            optionId: "custom-skill",
            optionMode: "balanced",
            customOption: customSkillOption
          })
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        6,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });
  });

  it("shows the viewed historical node options and branches from that node", async () => {
    const rootNode = {
      ...activeState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      roundIntent: "Root",
      selectedOptionId: "a" as const
    };
    const historicalNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      roundIndex: 2,
      roundIntent: "History",
      options: [
        { id: "a", label: "History A", description: "A", impact: "A", kind: "explore" },
        { id: "b", label: "History B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "History C", description: "C", impact: "C", kind: "finish" }
      ],
      selectedOptionId: "a" as const
    };
    const currentNode = {
      ...activeState.currentNode,
      id: "node-3",
      parentId: "node-2",
      roundIndex: 3,
      roundIntent: "Current",
      options: [
        { id: "a", label: "Current A", description: "A", impact: "A", kind: "explore" },
        { id: "b", label: "Current B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "Current C", description: "C", impact: "C", kind: "finish" }
      ]
    };
    const state = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-3" },
      currentNode,
      currentDraft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "Root", body: "Root body", hashtags: ["#root"], imagePrompt: "Root image" } },
        { nodeId: "node-2", draft: { title: "History", body: "History body", hashtags: ["#history"], imagePrompt: "History image" } },
        { nodeId: "node-3", draft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" } }
      ],
      selectedPath: [rootNode, historicalNode, currentNode],
      treeNodes: [rootNode, historicalNode, currentNode]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    expect(await screen.findByTestId("canvas-current-node")).toHaveTextContent("node-3");
    await userEvent.click(screen.getByRole("button", { name: "view historical node" }));

    expect(screen.getByTestId("canvas-current-node")).toHaveTextContent("node-2");
    expect(screen.getByTestId("canvas-options")).toHaveTextContent("History A|History B|History C");

    await userEvent.click(screen.getByRole("button", { name: "choose displayed option" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/sessions/session-1/branch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ nodeId: "node-2", optionId: "a", optionMode: "balanced" })
      })
    );
  });

  it("requests missing options for the viewed historical node", async () => {
    const rootNode = {
      ...activeState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      selectedOptionId: "a" as const
    };
    const historicalNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      roundIndex: 2,
      options: []
    };
    const currentNode = {
      ...activeState.currentNode,
      id: "node-3",
      parentId: "node-2",
      roundIndex: 3,
      options: [
        { id: "a", label: "Current A", description: "A", impact: "A", kind: "explore" },
        { id: "b", label: "Current B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "Current C", description: "C", impact: "C", kind: "finish" }
      ]
    };
    const state = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-3" },
      currentNode,
      currentDraft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "Root", body: "Root body", hashtags: ["#root"], imagePrompt: "Root image" } },
        { nodeId: "node-2", draft: { title: "History", body: "History body", hashtags: ["#history"], imagePrompt: "History image" } },
        { nodeId: "node-3", draft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" } }
      ],
      selectedPath: [rootNode, historicalNode, currentNode],
      treeNodes: [rootNode, historicalNode, currentNode]
    };
    const optionsState = {
      ...state,
      treeNodes: [
        rootNode,
        {
          ...historicalNode,
          roundIntent: "History options",
          options: [
            { id: "a", label: "History A", description: "A", impact: "A", kind: "explore" },
            { id: "b", label: "History B", description: "B", impact: "B", kind: "deepen" },
            { id: "c", label: "History C", description: "C", impact: "C", kind: "finish" }
          ]
        },
        currentNode
      ]
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(optionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "view historical node" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });
    expect(screen.getByTestId("canvas-current-node")).toHaveTextContent("node-2");
  });

  it("saves draft edits from the viewed node and requests missing child options", async () => {
    const rootNode = {
      ...activeState.currentNode,
      id: "node-1",
      parentId: null,
      roundIndex: 1,
      selectedOptionId: "a" as const
    };
    const historicalNode = {
      ...activeState.currentNode,
      id: "node-2",
      parentId: "node-1",
      roundIndex: 2,
      options: [
        { id: "a", label: "History A", description: "A", impact: "A", kind: "explore" },
        { id: "b", label: "History B", description: "B", impact: "B", kind: "deepen" },
        { id: "c", label: "History C", description: "C", impact: "C", kind: "finish" }
      ]
    };
    const currentNode = {
      ...activeState.currentNode,
      id: "node-3",
      parentId: "node-2",
      roundIndex: 3
    };
    const state = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-3" },
      currentNode,
      currentDraft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" },
      nodeDrafts: [
        { nodeId: "node-1", draft: { title: "Root", body: "Root body", hashtags: ["#root"], imagePrompt: "Root image" } },
        { nodeId: "node-2", draft: { title: "History", body: "History body", hashtags: ["#history"], imagePrompt: "History image" } },
        { nodeId: "node-3", draft: { title: "Current", body: "Current body", hashtags: ["#current"], imagePrompt: "Current image" } }
      ],
      selectedPath: [rootNode, historicalNode, currentNode],
      treeNodes: [rootNode, historicalNode, currentNode]
    };
    const draftOnlyState = {
      ...state,
      session: { ...state.session, currentNodeId: "node-4" },
      currentNode: {
        ...historicalNode,
        id: "node-4",
        parentId: "node-2",
        parentOptionId: "custom-edit-mock",
        roundIndex: 3,
        options: []
      },
      currentDraft: { title: "History", body: "Edited from mock", hashtags: ["#history"], imagePrompt: "History image" },
      nodeDrafts: [
        ...state.nodeDrafts,
        { nodeId: "node-4", draft: { title: "History", body: "Edited from mock", hashtags: ["#history"], imagePrompt: "History image" } }
      ],
      selectedPath: [
        rootNode,
        historicalNode,
        { ...historicalNode, id: "node-4", parentId: "node-2", parentOptionId: "custom-edit-mock", options: [] }
      ],
      treeNodes: [
        rootNode,
        historicalNode,
        currentNode,
        { ...historicalNode, id: "node-4", parentId: "node-2", parentOptionId: "custom-edit-mock", options: [] }
      ]
    };
    const optionsState = {
      ...draftOnlyState,
      currentNode: {
        ...draftOnlyState.currentNode,
        options: [
          { id: "a", label: "Next A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "Next B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "Next C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: draftOnlyState }) })
      .mockResolvedValueOnce(optionsNdjsonResponse(optionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await userEvent.click(await screen.findByRole("button", { name: "view historical node" }));
    await userEvent.click(screen.getByRole("button", { name: "save draft" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/draft",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            nodeId: "node-2",
            draft: { title: "History", body: "Edited from mock", hashtags: ["#history"], imagePrompt: "History image" }
          })
        })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/options",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-4" })
        })
      );
    });
  });

  it("uses selected text rewrite as a custom direction and follows the regular generation flow", async () => {
    const nodeOnlyState = {
      ...activeState,
      session: { ...activeState.session, currentNodeId: "node-2" },
      currentNode: {
        ...activeState.currentNode,
        id: "node-2",
        parentId: "node-1",
        parentOptionId: "custom-reference-mock",
        roundIndex: 2,
        roundIntent: "补一个细节",
        options: []
      },
      currentDraft: null,
      selectedPath: [
        activeState.currentNode,
        {
          ...activeState.currentNode,
          id: "node-2",
          parentId: "node-1",
          parentOptionId: "custom-reference-mock",
          roundIndex: 2,
          roundIntent: "补一个细节",
          options: []
        }
      ],
      treeNodes: [
        activeState.currentNode,
        {
          ...activeState.currentNode,
          id: "node-2",
          parentId: "node-1",
          parentOptionId: "custom-reference-mock",
          roundIndex: 2,
          roundIntent: "补一个细节",
          options: []
        }
      ]
    };
    const finalDraft = { title: "Draft first", body: "Draft body first", hashtags: ["#draft"], imagePrompt: "draft image" };
    const draftState = {
      ...nodeOnlyState,
      currentDraft: finalDraft,
      nodeDrafts: [...activeState.nodeDrafts, { nodeId: "node-2", draft: finalDraft }]
    };
    const optionsState = {
      ...draftState,
      currentNode: {
        ...draftState.currentNode,
        options: [
          { id: "a", label: "A", description: "A", impact: "A", kind: "explore" },
          { id: "b", label: "B", description: "B", impact: "B", kind: "deepen" },
          { id: "c", label: "C", description: "C", impact: "C", kind: "finish" }
        ]
      }
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: nodeOnlyState }) })
      .mockResolvedValueOnce(ndjsonResponse([`${JSON.stringify({ type: "done", state: draftState })}\n`]))
      .mockResolvedValueOnce(optionsNdjsonResponse(optionsState));
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("live-draft");
    await userEvent.click(screen.getByRole("button", { name: "rewrite selection" }));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        4,
        "/api/sessions/session-1/choose",
        expect.objectContaining({ method: "POST" })
      );
      const chooseBody = JSON.parse(fetchMock.mock.calls[3][1].body as string);
      expect(chooseBody).toEqual(
        expect.objectContaining({
          nodeId: "node-1",
          optionMode: "balanced",
          customOption: expect.objectContaining({
            description: expect.stringContaining("目标句。"),
            impact: "按引用文本和用户要求改写这一段。",
            kind: "reframe",
            label: "补一个细节"
          })
        })
      );
      expect(chooseBody.optionId).toBe(chooseBody.customOption.id);
      expect(chooseBody.customOption.description).toContain("用户引用文本：");
      expect(chooseBody.customOption.description).toContain("补一个细节");
      expect(chooseBody.customOption.description).not.toContain("引用选中文本继续生成");
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        5,
        "/api/sessions/session-1/draft/generate/stream",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nodeId: "node-2" })
        })
      );
    });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/sessions/session-1/options", expect.objectContaining({ method: "POST" }));
      expect(screen.getByTestId("canvas-generation-stage")).toHaveTextContent("idle");
    });
  });

  it("does not generate a draft when selected text custom direction creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "无法生成下一版草稿。" }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("live-draft");
    await userEvent.click(screen.getByRole("button", { name: "rewrite selection" }));

    expect(await screen.findByRole("status")).toHaveTextContent("无法生成下一版草稿。");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects stale selected text before rewriting or saving", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ skills }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rootMemory }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ state: activeState }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<TreeableApp />);

    await screen.findByTestId("live-draft");
    await userEvent.click(screen.getByRole("button", { name: "rewrite stale selection" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("选中文本已经变化，请重新选择。");
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/sessions/session-1/draft/rewrite-selection",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/sessions/session-1/draft",
      expect.objectContaining({ method: "POST" })
    );
  });
});
