import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * CSRF defense for TeamBrewer's own cookie-authenticated routes (security.md,
 * phase-13). Session cookies are `SameSite` + `httpOnly` and CORS is locked to
 * the app origin; this guard adds the standard belt-and-braces layer: on a
 * state-changing request that carries a session cookie, the `Origin` (or, as a
 * fallback, `Referer`) must match the allow-listed web origin.
 *
 * It intentionally only enforces when a session cookie is present, because CSRF
 * is only exploitable when the browser auto-attaches credentials. Requests
 * without the cookie are unauthenticated regardless and are left to the auth
 * guards — which also keeps header-authenticated integration tests unaffected.
 *
 * Better Auth's own routes (`/api/auth/*`) are handled outside the Nest pipeline
 * (main.ts) and provide their own CSRF/origin protection, so they never reach
 * this guard.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  private readonly logger = new Logger(OriginCheckGuard.name);

  private readonly stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  private get allowedOrigin(): string {
    return process.env["WEB_ORIGIN"] ?? "http://localhost:5173";
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.stateChangingMethods.has(request.method.toUpperCase())) {
      return true;
    }

    // Only cookie-authenticated requests are CSRF-exploitable.
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader || !/session_token/i.test(cookieHeader)) {
      return true;
    }

    const requestOrigin = this.resolveRequestOrigin(request);
    if (requestOrigin === this.allowedOrigin) {
      return true;
    }

    // Log the rejected attempt for audit (no cookie/PII), then refuse.
    this.logger.warn(
      `Rejected cross-origin state-changing request: method=${request.method} path=${request.path} origin=${requestOrigin ?? "<none>"}`,
    );
    throw new ForbiddenException("Cross-origin request rejected.");
  }

  /** The request's Origin, or the origin parsed from Referer as a fallback. */
  private resolveRequestOrigin(request: Request): string | null {
    const originHeader = request.headers.origin;
    if (typeof originHeader === "string" && originHeader !== "") {
      return originHeader;
    }
    const refererHeader = request.headers.referer;
    if (typeof refererHeader === "string" && refererHeader !== "") {
      try {
        return new URL(refererHeader).origin;
      } catch {
        return null;
      }
    }
    return null;
  }
}
