import { Injectable, NotFoundException } from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";

/**
 * The result of resolving an attachable subject within the verified team. A
 * subject that the caller cannot see (or that does not exist in the team) is
 * represented by a `null` resolver result — never a partial subject — so callers
 * uniformly return 404 without leaking existence (multi-tenancy.md).
 */
export interface ResolvedSubject {
  /**
   * Whether new comments may be posted on the subject right now. Reading existing
   * comments/activity is always allowed once the subject resolves; this is false
   * when the subject is locked for new discussion (e.g. an archived deck).
   */
  canComment: boolean;
  /**
   * Whether activity about this subject may appear in the team-wide feed. False
   * for private subjects (e.g. a personal deck draft) so the feed never leaks
   * their existence to teammates who cannot see the subject itself.
   */
  isTeamVisible: boolean;
}

/**
 * The contract a module implements to make one of its entities commentable and
 * activity-tracked (see docs/features/collaboration-core.md "the polymorphic
 * contract"). Collaboration never depends on the owning module: the module
 * registers a resolver for its `subjectType`, and the collaboration subsystem
 * calls it to check the subject exists in the team and whether it accepts
 * comments. The resolver filters by the **verified** `team.teamId` (never a
 * client value) and returns `null` for anything the caller cannot reach.
 */
export interface AttachableSubjectResolver {
  /** The `subjectType` string this resolver owns (e.g. `deck`). */
  readonly subjectType: string;
  /**
   * Resolve a subject by id within the verified team. Returns `null` if it does
   * not exist, belongs to another team, or the caller may not see it (→ 404).
   */
  resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null>;
}

/**
 * The registry of attachable-subject resolvers. Modules register their resolver
 * on init; the collaboration subsystem looks one up by `subjectType` to resolve
 * and authorize a subject. Keyed by arbitrary string so tests can exercise the
 * polymorphic code path with a subject type that is not (yet) in the shared enum.
 * A singleton: resolvers are stateless and take the team context as an argument.
 */
@Injectable()
export class SubjectResolverRegistry {
  private readonly resolvers = new Map<string, AttachableSubjectResolver>();

  /** Register a resolver for its `subjectType` (last registration wins). */
  register(resolver: AttachableSubjectResolver): void {
    this.resolvers.set(resolver.subjectType, resolver);
  }

  /** Whether a resolver is registered for the given subject type. */
  has(subjectType: string): boolean {
    return this.resolvers.has(subjectType);
  }

  /**
   * Resolve a subject within the team or throw 404. An unregistered subject type,
   * a missing subject, a foreign-team subject, and a subject the caller may not
   * see all funnel to the same not-found response (no enumeration).
   */
  async requireSubject(
    team: TeamContext,
    subjectType: string,
    subjectId: string,
  ): Promise<ResolvedSubject> {
    const resolver = this.resolvers.get(subjectType);
    const subject = resolver ? await resolver.resolve(team, subjectId) : null;
    if (!subject) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Subject not found." },
      });
    }
    return subject;
  }
}
