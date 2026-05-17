import { z } from "zod";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";

export const SocialPostRewriteSelectionInputSchema = z
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

export type SocialPostRewriteSelectionInput = z.infer<typeof SocialPostRewriteSelectionInputSchema>;

export function replaceSocialPostSelection(
  payload: SocialPostPayload,
  input: SocialPostRewriteSelectionInput
): SocialPostPayload {
  const parsedPayload = SocialPostPayloadSchema.parse(payload);
  const parsedInput = SocialPostRewriteSelectionInputSchema.parse(input);

  return {
    ...parsedPayload,
    body: replaceSelectedText(parsedPayload.body, parsedInput)
  };
}

function replaceSelectedText(body: string, input: SocialPostRewriteSelectionInput) {
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
