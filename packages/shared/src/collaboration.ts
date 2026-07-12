import { z } from "zod";

/**
 * Shared collaboration-core contracts (see docs/features/collaboration-core.md).
 * The subsystem is polymorphic: comments, notifications, and activity address a
 * subject by `(subjectType, subjectId)` rather than a per-module foreign key, so
 * any module gains discussion by declaring a `subjectType`. This file holds the
 * cross-cutting core (the subject-type enum + mention parsing); comment,
 * notification, and activity shapes live in their own sibling files.
 */

/**
 * The set of subjects the collaboration subsystem may attach to, validated at the
 * HTTP boundary. It is **extended as modules adopt** the subsystem — decks were the
 * first adopter (phase-04); events joined next. The runtime resolver registry is
 * keyed by arbitrary string, so tests can exercise the polymorphic code path with a
 * subject type that is not (yet) in this enum.
 */
export const subjectTypeSchema = z.enum(["deck", "event"]);
export type SubjectType = z.infer<typeof subjectTypeSchema>;

/**
 * Matches an `@handle` mention: an `@` at a boundary (start of string or a
 * character that is not part of a handle) followed by username characters
 * (`docs`/auth.ts `usernameSchema`: letters, digits, `.`, `_`, `-`). The
 * preceding-boundary lookbehind means an `@` inside an email address
 * (`bob@example.com`) is not treated as a mention. Resolution of a handle to an
 * actual in-team user happens server-side; the parser is deliberately permissive.
 */
const MENTION_HANDLE_PATTERN = /(?<![A-Za-z0-9._-])@([A-Za-z0-9._-]+)/g;

/**
 * Extract the distinct `@handle` mentions from a comment body, in first-seen
 * order. Case-sensitive (usernames are unique); the server resolves each handle
 * to a team member and silently ignores handles that match no member.
 */
export function parseMentionHandles(body: string): string[] {
  const handles: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(MENTION_HANDLE_PATTERN)) {
    const handle = match[1];
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  }
  return handles;
}
