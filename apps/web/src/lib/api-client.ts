import { errorEnvelopeSchema } from "@teambrewer/shared";

/** Structural view of a shared Zod schema — avoids a direct `zod` dependency in web. */
interface ResponseSchema<Output> {
  parse(data: unknown): Output;
}

/** A parsed error-envelope failure from the API (api-conventions.md). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions<Output> {
  /** Active team; sent as the `X-Team-Id` header for team-scoped routes only. */
  teamId?: string;
  body?: unknown;
  /** Optional shared schema to validate the response against the contract. */
  schema?: ResponseSchema<Output>;
}

async function request<Output>(
  method: string,
  path: string,
  options: RequestOptions<Output> = {},
): Promise<Output> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (options.teamId) {
    headers["x-team-id"] = options.teamId;
  }

  const init: RequestInit = {
    method,
    headers,
    // Send the Better Auth session cookie with every API call.
    credentials: "include",
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`/api${path}`, init);

  if (response.status === 204) {
    return undefined as Output;
  }

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(payload);
    if (envelope.success) {
      throw new ApiError(response.status, envelope.data.error.code, envelope.data.error.message);
    }
    throw new ApiError(response.status, "INTERNAL", `Request failed (${response.status}).`);
  }

  return options.schema ? options.schema.parse(payload) : (payload as Output);
}

export const apiClient = {
  get: <Output>(path: string, options?: RequestOptions<Output>) =>
    request<Output>("GET", path, options),
  post: <Output>(path: string, options?: RequestOptions<Output>) =>
    request<Output>("POST", path, options),
  patch: <Output>(path: string, options?: RequestOptions<Output>) =>
    request<Output>("PATCH", path, options),
  delete: <Output>(path: string, options?: RequestOptions<Output>) =>
    request<Output>("DELETE", path, options),
};
