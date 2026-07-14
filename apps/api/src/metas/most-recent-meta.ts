import type { PrismaService } from "../prisma/prisma.service.js";

/**
 * The single "most recent meta of a format" lookup shared by every former
 * current-meta default (deck default-link on create, per-deck readiness default,
 * game-log meta auto-suggest). There is no today-window resolution anymore
 * (docs/decisions/0010-meta-as-organizing-hub.md): the default is simply the
 * non-archived meta of the given `formatId` with the greatest `startDate`
 * (ties broken by the most recently created), or `null` when the format has none.
 *
 * `db` must be a **team-scoped** client (the scoping proxy injects the verified
 * `teamId`), so this never reaches another team's metas; callers pass their
 * `this.scoped.db`.
 */
export async function findMostRecentMetaForFormat(
  db: PrismaService,
  formatId: string,
): Promise<{ id: string; name: string } | null> {
  return (await db.meta.findFirst({
    where: { formatId, archivedAt: null },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    select: { id: true, name: true },
  })) as { id: string; name: string } | null;
}
