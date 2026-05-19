import { z } from "zod";

const ProcessDataDisplayItemSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(400).optional(),
    meta: z.string().trim().max(160).optional(),
    url: z.string().trim().max(1000).optional()
  })
  .strict();

export const ShowProcessDataInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    sourceToolCallIds: z.array(z.string().trim().min(1)).max(20).default([]),
    items: z.array(ProcessDataDisplayItemSchema).min(1).max(30),
    note: z.string().trim().max(500).optional()
  })
  .strict();

export type ProcessDataDisplay = z.infer<typeof ShowProcessDataInputSchema>;
