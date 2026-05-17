import type { ArtifactPluginServer } from "@/artifacts/types";
import { PrdPayloadSchema, type PrdPayload } from "./schema";

export const prdPlugin: ArtifactPluginServer<PrdPayload> = {
  id: "prd",
  label: "PRD 文档",
  description: "产品需求文档，用 Markdown 沉淀背景、目标、需求和风险。",
  payloadSchema: PrdPayloadSchema,
  aiOutputSchema: PrdPayloadSchema,
  capabilities: {
    actions: [],
    deliver: true,
    diff: true,
    edit: true,
    generate: true,
    streamFields: ["title", "markdown"]
  },
  createSeedPayload(input) {
    const seed = input.seed.trim();
    return seed ? { title: "种子 PRD", markdown: seed } : null;
  },
  promptInstructions() {
    return [
      "作品类型：PRD 文档。",
      "输出 JSON payload，字段为 title 和 markdown。",
      "markdown 必须用 Markdown 章节组织，优先包含背景、目标、非目标、用户、需求、指标、风险、待确认。"
    ].join("\n");
  },
  normalizeAiOutput(output) {
    return PrdPayloadSchema.parse(output);
  },
  summarizeForDirector(payload) {
    return [`文档标题：${payload.title || "未命名"}`, `PRD Markdown：${payload.markdown}`].join("\n");
  },
  summarizeForTree(payload) {
    return payload.title.trim() || "PRD 文档";
  }
};
