import type { ArtifactCapabilities } from "@/artifacts/types";

export const socialPostCapabilities = {
  actions: ["rewrite-selection"],
  deliver: true,
  diff: true,
  edit: true,
  generate: true,
  streamFields: ["title", "body", "hashtags", "imagePrompt"]
} satisfies ArtifactCapabilities;

export const socialPostManifest = {
  capabilities: socialPostCapabilities,
  description: "微博、小红书、朋友圈等社交媒体内容。",
  id: "social-post",
  label: "社媒内容"
};
