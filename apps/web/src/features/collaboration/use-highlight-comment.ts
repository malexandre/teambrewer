import { useLocation } from "@tanstack/react-router";

/** The location-hash prefix that anchors a specific comment, e.g. `#comment-<id>`. */
const COMMENT_HASH_PREFIX = "comment-";

/**
 * Extracts the target comment id from a location hash of the form `#comment-<id>`
 * (the anchor a notification deep-link points at). Tolerant of a present or absent
 * leading `#`, since routers differ on whether they keep it. Returns `undefined` for
 * any other hash so unrelated anchors never highlight a comment.
 */
export function parseCommentHash(hash: string | undefined): string | undefined {
  if (!hash) {
    return undefined;
  }
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalized.startsWith(COMMENT_HASH_PREFIX)) {
    return undefined;
  }
  const commentId = normalized.slice(COMMENT_HASH_PREFIX.length);
  return commentId.length > 0 ? commentId : undefined;
}

/**
 * The comment a notification deep-link is pointing at, read from the router location
 * hash (`#comment-<id>`), or `undefined` when the hash targets no comment. Mounted at
 * each comment-thread site so the matching {@link CommentThread} scrolls to and
 * highlights the source comment.
 */
export function useHighlightCommentId(): string | undefined {
  return useLocation({ select: (location) => parseCommentHash(location.hash) });
}
