import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { clear as idbClear, del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

/**
 * Offline-tolerant read caching for the PWA (frontend.md, phase-13). We persist
 * the TanStack Query cache to IndexedDB so card reference data and read-only
 * views survive a cold, offline reload — the "spotty tournament wifi" case.
 *
 * Tenancy is preserved by construction: team-scoped query keys are
 * `[teamId, ...]`, so a persisted entry can only ever be re-read under the same
 * team. We additionally refuse to persist per-user / global keys (`me`, `admin`)
 * so a shared device can't surface the previous user's identity or admin data
 * from disk, and we clear the store entirely on sign-out. We never cache the
 * tenant-shared reference JSON at the service-worker layer (see vite.config.ts) —
 * that isolation lives here, keyed by team.
 */

const PERSISTED_CACHE_KEY = "teambrewer-query-cache";

/** Query-key first segments that must never be written to disk. */
const NON_PERSISTED_KEY_PREFIXES = new Set(["me", "admin"]);

/**
 * Whether a query may be persisted. Team-scoped keys (`[teamId, ...]`) persist;
 * per-user/global keys (`me*`, `admin*`) do not. Pure and unit-tested.
 */
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const firstSegment = queryKey[0];
  if (typeof firstSegment !== "string") {
    return false;
  }
  return !NON_PERSISTED_KEY_PREFIXES.has(firstSegment);
}

/** Only persist successful, non-sensitive queries. */
export function shouldDehydrateQuery(query: Query): boolean {
  return query.state.status === "success" && shouldPersistQueryKey(query.queryKey);
}

/**
 * An IndexedDB-backed async storage for the persister. IndexedDB (not
 * localStorage) so the larger card/read datasets fit and reads/writes stay off
 * the main thread.
 */
const indexedDbStorage = {
  getItem: (key: string): Promise<string | null> =>
    idbGet<string>(key).then((value) => value ?? null),
  setItem: (key: string, value: string): Promise<void> => idbSet(key, value),
  removeItem: (key: string): Promise<void> => idbDel(key),
};

export const queryCachePersister = createAsyncStoragePersister({
  storage: indexedDbStorage,
  key: PERSISTED_CACHE_KEY,
});

/** Drop the entire persisted cache — called on sign-out so nothing survives. */
export async function clearPersistedQueryCache(): Promise<void> {
  await idbDel(PERSISTED_CACHE_KEY);
  // Best-effort: also clear the default idb-keyval store in case of key drift.
  await idbClear().catch(() => undefined);
}
