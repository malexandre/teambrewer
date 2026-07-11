import { z } from "zod";

/**
 * The uniform error envelope every API error is serialized into (see
 * api-conventions.md). A global exception filter maps thrown domain errors and
 * Zod validation failures to this shape, so the web app can rely on a single
 * error contract regardless of which endpoint failed.
 *
 * `code` is a stable machine-readable string (e.g. `TENANT_FORBIDDEN`);
 * `message` is safe to display to a user; `details` is optional structured
 * context such as per-field validation errors.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/**
 * Stable error codes shared between the API (which throws them) and the web app
 * (which may branch on them). Kept as a const object rather than a Zod enum so
 * both layers import the same identifiers without stringly-typed duplication.
 */
export const errorCode = {
  validationFailed: "VALIDATION_FAILED",
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  tenantForbidden: "TENANT_FORBIDDEN",
  notFound: "NOT_FOUND",
  conflict: "CONFLICT",
  domainRuleViolation: "DOMAIN_RULE_VIOLATION",
  invalidToken: "INVALID_TOKEN",
  lastTeamAdmin: "LAST_TEAM_ADMIN",
  loginMethodMismatch: "LOGIN_METHOD_MISMATCH",
  totpRequired: "TOTP_REQUIRED",
  internal: "INTERNAL",
} as const;

export type ErrorCode = (typeof errorCode)[keyof typeof errorCode];
