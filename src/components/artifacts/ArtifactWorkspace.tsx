"use client";

import type { Artifact, TreeNode } from "@/lib/domain";
import { getArtifactClientManifest, getArtifactRenderer } from "@/artifacts/client-registry";
import { ArtifactFallback } from "./ArtifactFallback";

export type ArtifactWorkspaceProps = {
  artifacts: Artifact[];
  currentNode: TreeNode | null;
  isBusy: boolean;
  isGenerating: boolean;
  onAction: (actionId: string, artifact: Artifact, input?: unknown) => void | Promise<void>;
  onSave: (artifact: Artifact) => void | Promise<void>;
  onSelectArtifact: (artifactId: string) => void;
  selectedArtifactId: string | null;
  thinkingText?: string;
};

export function ArtifactWorkspace({
  artifacts,
  currentNode,
  isBusy,
  isGenerating,
  onAction,
  onSave,
  onSelectArtifact,
  selectedArtifactId,
  thinkingText
}: ArtifactWorkspaceProps) {
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts.at(-1) ?? null;
  const selectedManifest = selectedArtifact ? getArtifactClientManifest(selectedArtifact.type) : null;
  const SelectedRenderer = selectedManifest ? getArtifactRenderer(selectedManifest.rendererKey) : null;
  const trimmedThinkingText = thinkingText?.trim() ?? "";
  const hasNoArtifactForCurrentNode = currentNode ? currentNode.producedArtifactId === null : false;

  return (
    <aside
      aria-busy={isGenerating}
      aria-labelledby="artifact-workspace-title"
      className={`artifact-workspace${isGenerating ? " module--generating" : ""}`}
    >
      <header className="artifact-workspace__header">
        <h2 id="artifact-workspace-title">产物</h2>
      </header>

      {artifacts.length > 0 ? (
        <div aria-label="产物列表" className="artifact-workspace__tabs" role="tablist">
          {artifacts.map((artifact) => {
            const isSelected = selectedArtifact?.id === artifact.id;

            return (
              <button
                aria-selected={isSelected}
                className="artifact-workspace__tab"
                key={artifact.id}
                onClick={() => onSelectArtifact(artifact.id)}
                role="tab"
                type="button"
              >
                {getArtifactLabel(artifact)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="artifact-workspace__body">
        {hasNoArtifactForCurrentNode ? (
          <div className="artifact-workspace__status" role="status">
            本步未生成产物
          </div>
        ) : null}

        {isBusy && trimmedThinkingText ? (
          <div aria-live="polite" className="artifact-workspace__thinking">
            {trimmedThinkingText}
          </div>
        ) : null}

        {selectedArtifact ? (
          SelectedRenderer ? (
            <SelectedRenderer
              artifact={selectedArtifact}
              isBusy={isBusy}
              onAction={(actionId, input) => onAction(actionId, selectedArtifact, input)}
              onSave={(payload) => onSave({ ...selectedArtifact, payload: payload ?? selectedArtifact.payload })}
            />
          ) : (
            <ArtifactFallback artifact={selectedArtifact} />
          )
        ) : (
          <div className="artifact-workspace__empty">
            <p>还没有产物。</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function getArtifactLabel(artifact: Artifact) {
  try {
    const payloadLabel = getPayloadLabel(artifact);
    if (payloadLabel) return payloadLabel;
  } catch {
    // Bad payloads should not break artifact navigation.
  }

  const manifest = getArtifactClientManifest(artifact.type);
  const shortId = artifact.id.slice(0, 8);

  return `${manifest?.label ?? artifact.type} ${shortId}`;
}

function getPayloadLabel(artifact: Artifact) {
  if (!isRecord(artifact.payload)) return "";

  if (artifact.type === "social-post") {
    const title = asNonEmptyString(artifact.payload.title);
    if (title) return title;

    const body = asNonEmptyString(artifact.payload.body);
    if (body) return truncate(body, 28);
  }

  if (artifact.type === "prd") {
    const title = asNonEmptyString(artifact.payload.title);
    if (title) return title;

    const heading = getFirstMarkdownHeading(asNonEmptyString(artifact.payload.markdown));
    if (heading) return heading;
  }

  return "";
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getFirstMarkdownHeading(markdown: string) {
  const heading = markdown
    .split("\n")
    .map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() ?? "")
    .find(Boolean);

  return heading ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number) {
  const characters = Array.from(value);
  return characters.length > maxLength ? `${characters.slice(0, maxLength).join("")}...` : value;
}
