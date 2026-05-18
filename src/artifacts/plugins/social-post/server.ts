import type { ArtifactPluginServer } from "@/artifacts/types";
import {
  assertSocialPostSelectionMatches,
  replaceSocialPostSelection,
  SocialPostRewriteSelectionInputSchema
} from "./actions";
import { socialPostManifest } from "./manifest";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";
import { rewriteSelectedSocialPostText } from "./selection-rewrite";

export const socialPostPlugin: ArtifactPluginServer<SocialPostPayload> = {
  ...socialPostManifest,
  payloadSchema: SocialPostPayloadSchema,
  aiOutputSchema: SocialPostPayloadSchema,
  createSeedPayload(input) {
    const body = input.seed.trim();
    return body ? { title: "种子念头", body, hashtags: [], imagePrompt: "" } : null;
  },
  promptInstructions() {
    return [
      "作品类型：社媒内容。",
      "输出 JSON payload，字段为 title、body、hashtags、imagePrompt。",
      "hashtags 必须是字符串数组，imagePrompt 没有时返回空字符串。"
    ].join("\n");
  },
  normalizeAiOutput(output) {
    return SocialPostPayloadSchema.parse(output);
  },
  async handleAction({ artifact, input, sessionState }) {
    const payload = SocialPostPayloadSchema.parse(artifact.payload);
    const rewriteInput = SocialPostRewriteSelectionInputSchema.parse(input);
    assertSocialPostSelectionMatches(payload, rewriteInput);
    const { replacementText } = await rewriteSelectedSocialPostText({
      currentPayload: payload,
      enabledSkills: sessionState.enabledSkills ?? [],
      field: rewriteInput.field,
      instruction: rewriteInput.instruction,
      learnedSummary: sessionState.rootMemory.learnedSummary,
      pathSummary: "",
      rootSummary: sessionState.rootMemory.summary,
      selectedText: rewriteInput.selectedText
    });

    return {
      payload: replaceSocialPostSelection(payload, { ...rewriteInput, replacementText }),
      sourceArtifactIds: [artifact.id]
    };
  },
  summarizeForDirector(payload) {
    return [
      `标题：${payload.title || "未命名"}`,
      `正文：${payload.body}`,
      `话题：${payload.hashtags.join("、") || "暂无"}`,
      `配图提示：${payload.imagePrompt || "暂无"}`
    ].join("\n");
  },
  summarizeForTree(payload) {
    return payload.title.trim() || Array.from(payload.body.trim()).slice(0, 24).join("") || "社媒内容";
  }
};
