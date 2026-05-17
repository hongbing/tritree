"use client";

import type { Artifact, TreeNode } from "@/lib/domain";

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
  isGenerating,
  selectedArtifactId,
  thinkingText
}: ArtifactWorkspaceProps) {
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null;

  return (
    <aside aria-busy={isGenerating} className="draft-panel">
      <div className="draft-panel__scroll">
        {isGenerating ? (
          <div aria-label="作品生成状态" aria-live="polite" className="draft-streaming-status" role="status">
            <div className="draft-streaming-status__content">
              <span className="draft-streaming-status__title">{thinkingText || "正在生成作品..."}</span>
            </div>
          </div>
        ) : null}
        {selectedArtifact ? (
          <article className="draft-content">
            <pre>{JSON.stringify(selectedArtifact.payload, null, 2)}</pre>
          </article>
        ) : (
          <div className="draft-empty-state">
            <p>还没有作品。</p>
          </div>
        )}
      </div>
    </aside>
  );
}
