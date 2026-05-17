import { z } from "zod";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";

const SocialPostRewriteSelectionInputBaseSchema = z
  .object({
    field: z.literal("body"),
    instruction: z.string().trim().min(1).max(1200),
    selectedText: z.string().max(6000).refine((value) => value.trim().length > 0),
    selectionEnd: z.number().int().nonnegative(),
    selectionStart: z.number().int().nonnegative()
  })
  .strict();

export const SocialPostRewriteSelectionInputSchema =
  SocialPostRewriteSelectionInputBaseSchema.superRefine(validateSelectionRange);

export type SocialPostRewriteSelectionInput = z.infer<typeof SocialPostRewriteSelectionInputSchema>;

const SocialPostRewriteSelectionResultInputSchema = SocialPostRewriteSelectionInputBaseSchema.extend({
  replacementText: z.string().max(6000).refine((value) => value.trim().length > 0)
}).strict().superRefine(validateSelectionRange);

export function replaceSocialPostSelection(
  payload: SocialPostPayload,
  input: SocialPostRewriteSelectionInput & { replacementText: string }
): SocialPostPayload {
  const parsedPayload = SocialPostPayloadSchema.parse(payload);
  const parsedInput = SocialPostRewriteSelectionResultInputSchema.parse(input);

  return {
    ...parsedPayload,
    body: replaceSelectedText(parsedPayload.body, parsedInput)
  };
}

function replaceSelectedText(body: string, input: SocialPostRewriteSelectionInput & { replacementText: string }) {
  const selectedText = body.slice(input.selectionStart, input.selectionEnd);
  if (selectedText !== input.selectedText) {
    throw new Error("Selected text no longer matches the artifact body.");
  }

  return `${body.slice(0, input.selectionStart)}${input.replacementText}${body.slice(input.selectionEnd)}`;
}

function validateSelectionRange(
  input: { selectionEnd: number; selectionStart: number },
  context: z.RefinementCtx
) {
  if (input.selectionEnd < input.selectionStart) {
    context.addIssue({
      code: "custom",
      message: "selectionEnd must be greater than or equal to selectionStart."
    });
  }
}
