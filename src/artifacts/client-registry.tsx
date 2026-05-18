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
  if (manifests.has(plugin.manifest.id)) {
    throw new Error(`Duplicate artifact client plugin id: ${plugin.manifest.id}`);
  }

  manifests.set(plugin.manifest.id, plugin.manifest);
  for (const [key, renderer] of Object.entries(plugin.renderers)) {
    if (renderers.has(key)) {
      throw new Error(`Duplicate artifact renderer key: ${key}`);
    }

    renderers.set(key, renderer);
  }
}

export function getArtifactClientManifest(type: string) {
  return manifests.get(type) ?? null;
}

export function getArtifactRenderer(rendererKey: string) {
  return renderers.get(rendererKey) ?? null;
}
