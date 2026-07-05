import { z } from "zod";

export const factCheckStatusSchema = z.enum([
  "correct",
  "misleading",
  "incorrect",
  "unverifiable",
]);

export const sourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  credibility: z.enum(["high", "medium", "low"]),
});

export const factCheckResultSchema = z.object({
  text: z.string(),
  status: factCheckStatusSchema,
  correction: z.string(),
  sourceIndices: z.array(z.number()),
});

export const checkResponseSchema = z.object({
  results: z.array(factCheckResultSchema),
});

export type FactCheckStatus = z.infer<typeof factCheckStatusSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type FactCheckResultRaw = z.infer<typeof factCheckResultSchema>;
