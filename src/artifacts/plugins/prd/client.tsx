import type { ArtifactRendererProps } from "@/artifacts/types";
import { prdPlugin } from "./server";
import { PrdPayloadSchema } from "./schema";

function PrdRenderer({ artifact }: ArtifactRendererProps) {
  const parsed = PrdPayloadSchema.safeParse(artifact.payload);
  if (!parsed.success) {
    return (
      <article className="artifact-renderer" data-testid="prd-renderer">
        <h3>{artifact.type}</h3>
        <pre>{JSON.stringify(artifact.payload, null, 2)}</pre>
      </article>
    );
  }

  const payload = parsed.data;

  return (
    <article className="artifact-renderer artifact-renderer--prd" data-testid="prd-renderer">
      <h3>{payload.title || prdPlugin.label}</h3>
      <pre>{payload.markdown}</pre>
    </article>
  );
}

export const prdClientPlugin = {
  manifest: {
    capabilities: prdPlugin.capabilities,
    description: prdPlugin.description,
    id: prdPlugin.id,
    label: prdPlugin.label,
    rendererKey: "prd/default"
  },
  renderers: {
    "prd/default": PrdRenderer
  }
};
