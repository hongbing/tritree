import { z } from "zod";
import type { ArtifactPluginServer } from "@/artifacts/types";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";

const RewriteSelectionInputSchema = z
  .object({
    field: z.literal("body"),
    replacementText: z.string().max(6000).refine((value) => value.trim().length > 0),
    selectedText: z.string().max(6000).refine((value) => value.trim().length > 0),
    selectionEnd: z.number().int().nonnegative().optional(),
    selectionStart: z.number().int().nonnegative().optional()
  })
  .strict()
  .superRefine((input, context) => {
    const hasStart = input.selectionStart !== undefined;
    const hasEnd = input.selectionEnd !== undefined;
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        message: "selectionStart and selectionEnd must be provided together."
      });
      return;
    }

    if (input.selectionStart !== undefined && input.selectionEnd !== undefined && input.selectionEnd < input.selectionStart) {
      context.addIssue({
        code: "custom",
        message: "selectionEnd must be greater than or equal to selectionStart."
      });
    }
  });

export const socialPostPlugin: ArtifactPluginServer<SocialPostPayload> = {
  id: "social-post",
  label: "社媒内容",
  description: "微博、小红书、朋友圈等社交媒体内容。",
  payloadSchema: SocialPostPayloadSchema,
  aiOutputSchema: SocialPostPayloadSchema,
  capabilities: {
    actions: ["rewrite-selection"],
    deliver: true,
    diff: true,
    edit: true,
    generate: true,
    streamFields: ["title", "body", "hashtags", "imagePrompt"]
  },
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
  async handleAction({ artifact, input }) {
    const payload = SocialPostPayloadSchema.parse(artifact.payload);
    const rewriteInput = RewriteSelectionInputSchema.parse(input);
    const body = replaceSelectedText(payload.body, rewriteInput);

    return {
      payload: {
        ...payload,
        body
      },
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

function replaceSelectedText(
  body: string,
  input: z.infer<typeof RewriteSelectionInputSchema>
) {
  if (input.selectionStart !== undefined && input.selectionEnd !== undefined) {
    const selectedText = body.slice(input.selectionStart, input.selectionEnd);
    if (selectedText !== input.selectedText) {
      throw new Error("Selected text no longer matches the artifact body.");
    }

    return `${body.slice(0, input.selectionStart)}${input.replacementText}${body.slice(input.selectionEnd)}`;
  }

  const selectionIndex = body.indexOf(input.selectedText);
  if (selectionIndex === -1) {
    throw new Error("Selected text was not found in the artifact body.");
  }

  return `${body.slice(0, selectionIndex)}${input.replacementText}${body.slice(selectionIndex + input.selectedText.length)}`;
}
