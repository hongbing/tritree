import type { ArtifactRendererProps } from "@/artifacts/types";
import { socialPostPlugin } from "./server";
import { SocialPostPayloadSchema } from "./schema";

function SocialPostRenderer({ artifact }: ArtifactRendererProps) {
  const parsed = SocialPostPayloadSchema.safeParse(artifact.payload);
  if (!parsed.success) {
    return (
      <article className="artifact-renderer" data-testid="social-post-renderer">
        <h3>{artifact.type}</h3>
        <pre>{JSON.stringify(artifact.payload, null, 2)}</pre>
      </article>
    );
  }

  const payload = parsed.data;

  return (
    <article className="artifact-renderer artifact-renderer--social-post" data-testid="social-post-renderer">
      <h3>{payload.title || socialPostPlugin.label}</h3>
      <p>{payload.body}</p>
    </article>
  );
}

export const socialPostClientPlugin = {
  manifest: {
    capabilities: socialPostPlugin.capabilities,
    description: socialPostPlugin.description,
    id: socialPostPlugin.id,
    label: socialPostPlugin.label,
    rendererKey: "social-post/default"
  },
  renderers: {
    "social-post/default": SocialPostRenderer
  }
};
