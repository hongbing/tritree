import type { ArtifactPluginClientManifest, ArtifactRenderer } from "@/artifacts/types";
import { prdClientPlugin } from "@/artifacts/plugins/prd/client";
import { socialPostClientPlugin } from "@/artifacts/plugins/social-post/client";

type ArtifactClientPlugin = {
  manifest: ArtifactPluginClientManifest;
  renderers: Record<string, ArtifactRenderer>;
};

const bundledClientPlugins = [socialPostClientPlugin, prdClientPlugin] satisfies ArtifactClientPlugin[];

const manifests = new Map<string, ArtifactPluginClientManifest>();
const renderers = new Map<string, ArtifactRenderer>();

for (const plugin of bundledClientPlugins) {
  manifests.set(plugin.manifest.id, plugin.manifest);
  for (const [key, renderer] of Object.entries(plugin.renderers)) {
    renderers.set(key, renderer);
  }
}

export function getArtifactClientManifest(type: string) {
  return manifests.get(type) ?? null;
}

export function getArtifactRenderer(rendererKey: string) {
  return renderers.get(rendererKey) ?? null;
}
