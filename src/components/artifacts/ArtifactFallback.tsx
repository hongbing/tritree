import type { Artifact } from "@/lib/domain";

export type ArtifactFallbackProps = {
  artifact: Artifact;
};

export function ArtifactFallback({ artifact }: ArtifactFallbackProps) {
  return (
    <article className="artifact-fallback">
      <h3>无法预览 {artifact.type}</h3>
      <p>暂时没有可用的产物预览组件，下面是原始 payload。</p>
      <pre>{stringifyPayload(artifact.payload)}</pre>
    </article>
  );
}

function stringifyPayload(payload: unknown) {
  try {
    return JSON.stringify(payload, null, 2) ?? String(payload);
  } catch {
    return String(payload);
  }
}
