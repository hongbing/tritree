import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Artifact, TreeNode } from "@/lib/domain";
import { ArtifactWorkspace } from "./ArtifactWorkspace";

function socialPostArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-social-1",
    type: "social-post",
    version: 1,
    payload: {
      title: "Launch note",
      body: "A short social post body.",
      hashtags: ["AI"],
      imagePrompt: ""
    },
    sourceArtifactIds: [],
    createdByNodeId: "node-artifact-social",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function prdArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-prd-1",
    type: "prd",
    version: 1,
    payload: {
      title: "Workspace PRD",
      markdown: "# Workspace PRD\n\n## Goals\nKeep artifact UI generic."
    },
    sourceArtifactIds: [],
    createdByNodeId: "node-artifact-prd",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function unknownArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "artifact-unknown-1",
    type: "mind-map",
    version: 1,
    payload: {
      title: "Raw structure",
      nodes: [{ id: "root", label: "Root" }]
    },
    sourceArtifactIds: [],
    createdByNodeId: "node-artifact-unknown",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function artifactNode(artifactId = "artifact-social-1", overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "node-artifact",
    sessionId: "session-1",
    parentId: null,
    parentOptionId: null,
    kind: "artifact",
    producedArtifactId: artifactId,
    sourceArtifactIds: [],
    roundIndex: 1,
    roundIntent: "Generate an artifact.",
    options: [],
    selectedOptionId: null,
    foldedOptions: [],
    agentMessages: [],
    createdAt: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function analysisNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: "node-analysis",
    sessionId: "session-1",
    parentId: "node-artifact",
    parentOptionId: "a",
    kind: "analysis",
    producedArtifactId: null,
    sourceArtifactIds: ["artifact-social-1"],
    roundIndex: 2,
    roundIntent: "Analyze the current artifact.",
    options: [],
    selectedOptionId: null,
    foldedOptions: [],
    agentMessages: [],
    createdAt: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

function renderWorkspace(props: Partial<React.ComponentProps<typeof ArtifactWorkspace>> = {}) {
  const social = socialPostArtifact();

  return render(
    <ArtifactWorkspace
      artifacts={[social]}
      currentNode={artifactNode(social.id)}
      isBusy={false}
      isGenerating={false}
      onAction={vi.fn()}
      onSave={vi.fn()}
      onSelectArtifact={vi.fn()}
      selectedArtifactId={social.id}
      {...props}
    />
  );
}

describe("ArtifactWorkspace", () => {
  it("lists multiple artifacts and dispatches to the selected renderer", async () => {
    const user = userEvent.setup();
    const onSelectArtifact = vi.fn();
    const social = socialPostArtifact();
    const prd = prdArtifact();

    renderWorkspace({
      artifacts: [social, prd],
      currentNode: artifactNode(prd.id),
      onSelectArtifact,
      selectedArtifactId: prd.id
    });

    const workspace = screen.getByRole("complementary", { name: "产物" });
    const tabs = within(workspace).getByRole("tablist", { name: "产物列表" });

    expect(within(tabs).getByRole("tab", { name: /Launch note/ })).toHaveAttribute("aria-selected", "false");
    expect(within(tabs).getByRole("tab", { name: /Workspace PRD/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("prd-renderer")).toHaveTextContent("Workspace PRD");
    expect(screen.queryByTestId("social-post-renderer")).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole("tab", { name: /Launch note/ }));

    expect(onSelectArtifact).toHaveBeenCalledWith(social.id);
  });

  it("keeps content visible and marks a no-artifact node", () => {
    const social = socialPostArtifact();

    renderWorkspace({
      artifacts: [social],
      currentNode: analysisNode(),
      isBusy: true,
      isGenerating: true,
      selectedArtifactId: social.id,
      thinkingText: "正在分析当前版本"
    });

    expect(screen.getByTestId("social-post-renderer")).toHaveTextContent("A short social post body.");
    expect(screen.getByRole("status")).toHaveTextContent("本步未生成产物");
    expect(screen.getByText("正在分析当前版本")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "产物" })).toHaveClass("module--generating");
  });

  it("shows raw payload fallback when plugin unavailable", () => {
    const unknown = unknownArtifact();

    renderWorkspace({
      artifacts: [unknown],
      currentNode: artifactNode(unknown.id),
      selectedArtifactId: unknown.id
    });

    expect(screen.getByRole("heading", { name: "无法预览 mind-map" })).toBeInTheDocument();
    expect(screen.getByText(/"nodes"/)).toBeInTheDocument();
    expect(screen.getByText(/"Root"/)).toBeInTheDocument();
  });
});
