import type { ArtifactPluginServer } from "@/artifacts/types";
import { prdPlugin } from "@/artifacts/plugins/prd/server";
import { socialPostPlugin } from "@/artifacts/plugins/social-post/server";

const bundledPlugins = [socialPostPlugin, prdPlugin] satisfies ArtifactPluginServer<unknown, unknown>[];

function buildRegistry(plugins: ArtifactPluginServer<unknown, unknown>[]) {
  const registry = new Map<string, ArtifactPluginServer<unknown, unknown>>();
  for (const plugin of plugins) {
    if (registry.has(plugin.id)) throw new Error(`Duplicate artifact plugin id: ${plugin.id}`);
    registry.set(plugin.id, plugin);
  }
  return registry;
}

const registry = buildRegistry(bundledPlugins);

export function listArtifactPlugins() {
  return bundledPlugins;
}

export function getArtifactPlugin(type: string) {
  return registry.get(type) ?? null;
}

export function requireArtifactPlugin(type: string) {
  const plugin = getArtifactPlugin(type);
  if (!plugin) throw new Error(`Unknown artifact plugin: ${type}`);
  return plugin;
}

export function validateArtifactPayload(type: string, payload: unknown) {
  const plugin = requireArtifactPlugin(type);
  const parsed = plugin.payloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error(`Invalid artifact payload for ${type}: ${parsed.error.message}`);
  return parsed.data;
}
