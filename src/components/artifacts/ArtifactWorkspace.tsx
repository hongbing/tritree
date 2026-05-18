"use client";

import type { ReactNode } from "react";
import { GitCompare, X } from "lucide-react";
import type { Artifact, TreeNode } from "@/lib/domain";
import { getArtifactClientManifest, getArtifactRenderer } from "@/artifacts/client-registry";
import { ArtifactFallback } from "./ArtifactFallback";

export type ArtifactWorkspaceProps = {
  artifacts: Artifact[];
  canCompareArtifacts?: boolean;
  comparisonArtifacts?: { from: Artifact; to: Artifact } | null;
  comparisonLabels?: { from: string; to: string } | null;
  comparisonSelectionCount?: number;
  currentNode: TreeNode | null;
  generationStage?: "artifact" | "options" | null;
  headerActions?: ReactNode;
  headerPanel?: ReactNode;
  isBusy: boolean;
  isComparisonMode?: boolean;
  isGenerating: boolean;
  onAction: (actionId: string, artifact: Artifact, input?: unknown) => void | Promise<void>;
  onCancelComparison?: () => void;
  onSave: (artifact: Artifact) => void | Promise<void>;
  onSelectArtifact: (artifactId: string) => void;
  onStartComparison?: () => void;
  selectedArtifactId: string | null;
  thinkingText?: string;
};

export function ArtifactWorkspace({
  artifacts,
  canCompareArtifacts = false,
  comparisonArtifacts = null,
  comparisonLabels = null,
  comparisonSelectionCount = 0,
  currentNode,
  generationStage = null,
  headerActions,
  headerPanel,
  isBusy,
  isComparisonMode = false,
  isGenerating,
  onAction,
  onCancelComparison,
  onSave,
  onSelectArtifact,
  onStartComparison,
  selectedArtifactId,
  thinkingText
}: ArtifactWorkspaceProps) {
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts.at(-1) ?? null;
  const selectedManifest = selectedArtifact ? getArtifactClientManifest(selectedArtifact.type) : null;
  const SelectedRenderer = selectedManifest ? getArtifactRenderer(selectedManifest.rendererKey) : null;
  const trimmedThinkingText = thinkingText?.trim() ?? "";
  const hasNoArtifactForCurrentNode = currentNode ? currentNode.producedArtifactId === null : false;
  const canUseComparison = canCompareArtifacts || isComparisonMode;

  return (
    <aside
      aria-busy={isGenerating}
      aria-labelledby="artifact-workspace-title"
      className={`artifact-workspace${isGenerating ? " module--generating" : ""}`}
    >
      <header className="artifact-workspace__header">
        <h2 id="artifact-workspace-title">产物</h2>
        <div className="artifact-workspace__header-actions">
          {canUseComparison ? (
            <button
              aria-pressed={isComparisonMode}
              className="artifact-workspace__compare-button"
              disabled={isBusy && !isComparisonMode}
              onClick={isComparisonMode ? onCancelComparison : onStartComparison}
              type="button"
            >
              {isComparisonMode ? <X aria-hidden="true" size={14} /> : <GitCompare aria-hidden="true" size={14} />}
              <span>{isComparisonMode ? "退出对比" : "对比"}</span>
            </button>
          ) : null}
          {headerActions}
        </div>
      </header>
      {headerPanel}

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

        {isBusy && generationStage === "artifact" && trimmedThinkingText ? (
          <div aria-live="polite" className="artifact-workspace__thinking">
            {trimmedThinkingText}
          </div>
        ) : null}

        {isComparisonMode ? (
          <ArtifactComparisonView
            comparisonArtifacts={comparisonArtifacts}
            comparisonLabels={comparisonLabels}
            comparisonSelectionCount={comparisonSelectionCount}
            isBusy={isBusy}
          />
        ) : selectedArtifact ? (
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

function ArtifactComparisonView({
  comparisonArtifacts,
  comparisonLabels,
  comparisonSelectionCount,
  isBusy
}: {
  comparisonArtifacts: { from: Artifact; to: Artifact } | null;
  comparisonLabels: { from: string; to: string } | null;
  comparisonSelectionCount: number;
  isBusy: boolean;
}) {
  if (!comparisonArtifacts) {
    return (
      <div className="artifact-comparison__status" role="status">
        {comparisonSelectionCount === 1 ? "继续选择另一个节点" : "点选两个节点开始对比"}
      </div>
    );
  }

  return (
    <div className="artifact-comparison">
      {comparisonLabels ? (
        <div className="artifact-comparison__status" role="status">
          {comparisonLabels.from}
          {" -> "}
          {comparisonLabels.to}
        </div>
      ) : null}
      <div className="artifact-comparison__grid">
        <section className="artifact-comparison__pane">
          <h3>{comparisonLabels?.from ?? "起点"}</h3>
          <ArtifactPreview artifact={comparisonArtifacts.from} isBusy={isBusy} />
        </section>
        <section className="artifact-comparison__pane">
          <h3>{comparisonLabels?.to ?? "终点"}</h3>
          <ArtifactPreview artifact={comparisonArtifacts.to} isBusy={isBusy} />
        </section>
      </div>
    </div>
  );
}

function ArtifactPreview({ artifact, isBusy }: { artifact: Artifact; isBusy: boolean }) {
  const manifest = getArtifactClientManifest(artifact.type);
  const Renderer = manifest ? getArtifactRenderer(manifest.rendererKey) : null;

  return Renderer ? <Renderer artifact={artifact} isBusy={isBusy} /> : <ArtifactFallback artifact={artifact} />;
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
