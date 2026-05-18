import { z } from "zod";

export const SocialPostPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
  imagePrompt: z.string()
});

export type SocialPostPayload = z.infer<typeof SocialPostPayloadSchema>;
