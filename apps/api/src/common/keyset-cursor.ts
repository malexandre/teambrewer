/**
 * Opaque keyset-pagination cursor over a `(sortValue, id)` pair, ordered
 * descending. The two parts are space-separated (an ISO-8601 timestamp never
 * contains a space) and base64url-encoded so the cursor is URL-safe and opaque
 * to clients. Shared by every list endpoint that paginates by a timestamp + id.
 */
export function encodeKeysetCursor(sortValue: Date, id: string): string {
  return Buffer.from(`${sortValue.toISOString()} ${id}`, "utf8").toString("base64url");
}

export function decodeKeysetCursor(cursor: string): { sortValue: Date; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const separatorIndex = decoded.indexOf(" ");
  const isoString = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
  const id = separatorIndex === -1 ? "" : decoded.slice(separatorIndex + 1);
  return { sortValue: new Date(isoString), id };
}
