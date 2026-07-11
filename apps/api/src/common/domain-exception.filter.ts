import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

import { type ErrorCode, errorCode, type ErrorEnvelope } from "@teambrewer/shared";

function envelope(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return details ? { error: { code, message, details } } : { error: { code, message } };
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return errorCode.validationFailed;
    case HttpStatus.UNAUTHORIZED:
      return errorCode.unauthenticated;
    case HttpStatus.FORBIDDEN:
      return errorCode.forbidden;
    case HttpStatus.NOT_FOUND:
      return errorCode.notFound;
    case HttpStatus.CONFLICT:
      return errorCode.conflict;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return errorCode.domainRuleViolation;
    default:
      return errorCode.internal;
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return false;
  }
  const error = (body as { error: unknown }).error;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

/**
 * Maps every thrown error to the uniform error envelope (api-conventions.md):
 * `{ error: { code, message, details? } }`. Handlers and guards that already
 * throw an envelope-shaped body are passed through unchanged; Zod failures
 * become 400 VALIDATION_FAILED with the issues; anything unexpected becomes a
 * generic 500 (never leaking internals).
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodError) {
      response.status(HttpStatus.BAD_REQUEST).json(
        envelope(errorCode.validationFailed, "The request failed validation.", {
          issues: exception.issues,
        }),
      );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isErrorEnvelope(body)) {
        response.status(status).json(body);
        return;
      }
      const message =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      response
        .status(status)
        .json(
          envelope(
            codeForStatus(status),
            Array.isArray(message) ? message.join(", ") : String(message),
          ),
        );
      return;
    }

    // Unknown error: log server-side (no PII in the response) and return a
    // generic 500.
    this.logger.error(
      "Unhandled exception",
      exception instanceof Error ? exception.stack : String(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(envelope(errorCode.internal, "An unexpected error occurred."));
  }
}
