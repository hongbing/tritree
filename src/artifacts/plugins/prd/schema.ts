import { z } from "zod";

export const PrdPayloadSchema = z.object({
  title: z.string(),
  markdown: z.string()
});

export type PrdPayload = z.infer<typeof PrdPayloadSchema>;
