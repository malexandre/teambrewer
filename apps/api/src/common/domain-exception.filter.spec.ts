import { type ArgumentsHost, ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { errorCode } from "@teambrewer/shared";

import { DomainExceptionFilter } from "./domain-exception.filter.js";

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function buildHost(captured: CapturedResponse): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };
  return {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe("DomainExceptionFilter", () => {
  const filter = new DomainExceptionFilter();

  it("maps a Zod error to a 400 validation envelope with issues", () => {
    const captured: CapturedResponse = {};
    let zodError: z.ZodError;
    try {
      z.object({ name: z.string() }).parse({});
      throw new Error("expected parse to throw");
    } catch (error) {
      zodError = error as z.ZodError;
    }

    filter.catch(zodError, buildHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body).toMatchObject({
      error: { code: errorCode.validationFailed },
    });
    expect(
      (captured.body as { error: { details: { issues: unknown[] } } }).error.details.issues,
    ).toBeInstanceOf(Array);
  });

  it("passes through an already-enveloped HttpException body", () => {
    const captured: CapturedResponse = {};
    const exception = new ForbiddenException({
      error: { code: errorCode.tenantForbidden, message: "No access." },
    });

    filter.catch(exception, buildHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(captured.body).toEqual({
      error: { code: errorCode.tenantForbidden, message: "No access." },
    });
  });

  it("wraps a plain HttpException using the status-derived code", () => {
    const captured: CapturedResponse = {};
    filter.catch(new HttpException("Nope", HttpStatus.CONFLICT), buildHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.CONFLICT);
    expect(captured.body).toEqual({
      error: { code: errorCode.conflict, message: "Nope" },
    });
  });

  it("maps a forbidden exception to the FORBIDDEN code", () => {
    const captured: CapturedResponse = {};
    filter.catch(new ForbiddenException(), buildHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect((captured.body as { error: { code: string } }).error.code).toBe(errorCode.forbidden);
  });

  it("returns a generic 500 for an unexpected error without leaking details", () => {
    const captured: CapturedResponse = {};
    filter.catch(new Error("database exploded with secret connection string"), buildHost(captured));

    expect(captured.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({
      error: { code: errorCode.internal, message: "An unexpected error occurred." },
    });
  });
});
