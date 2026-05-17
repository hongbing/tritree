import type { ArtifactCapabilities } from "@/artifacts/types";

export const prdCapabilities = {
  actions: [],
  deliver: true,
  diff: true,
  edit: true,
  generate: true,
  streamFields: ["title", "markdown"]
} satisfies ArtifactCapabilities;

export const prdManifest = {
  capabilities: prdCapabilities,
  description: "产品需求文档，用 Markdown 沉淀背景、目标、需求和风险。",
  id: "prd",
  label: "PRD 文档"
};
