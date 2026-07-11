import { z } from "zod";

/**
 * Response shape for `GET /api/health`. This is the first shared contract: the
 * API validates its response against it and the web app infers its type from it,
 * proving the single-source-of-truth pattern end to end (see api-conventions.md).
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
