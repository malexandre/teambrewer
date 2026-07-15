import { Link } from "@tanstack/react-router";
import { type MetaSummary } from "@teambrewer/shared";
import { Ban, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useHeroes } from "@/features/cards/use-heroes";

import { formatMetaDate } from "./meta-display";
import { useMetas } from "./use-metas";

/**
 * The team's non-archived metas as newest-first cards (by start date). Each card leads with a
 * full-height imagery panel that reflects *why* the meta exists (its optional change reason): a
 * product release shows the pasted marketing image, heroes going Living Legend show the retiring
 * hero's art, a ban-list update shows a ban glyph, and a meta with no reason falls back to the
 * neutral Target glyph (matching the sidebar's Metas icon). There is no "current meta": the newest
 * of each format is simply first. Mobile-first; each card links to the meta hub.
 */
export function MetaList({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useMetas(teamId);
  const { data: heroData } = useHeroes(teamId);
  const metas = data?.data ?? [];
  const heroesById = new Map((heroData?.data ?? []).map((hero) => [hero.id, hero]));

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading metas…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Could not load metas.</p>;
  }
  if (metas.length === 0) {
    return <p className="text-sm text-muted-foreground">No metas yet.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {metas.map((meta) => (
        <li key={meta.id}>
          <Link
            to="/metas/$metaId"
            params={{ metaId: meta.id }}
            className="flex h-full min-h-[7.5rem] items-stretch overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <MetaChangeReasonPanel meta={meta} heroImage={resolveHeroImage(meta, heroesById)} />

            <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
              <span className="truncate font-semibold leading-tight" title={meta.name}>
                {meta.name}
              </span>
              <Badge tone="primary" size="sm" className="self-start">
                {meta.formatName}
              </Badge>
              <span className="mt-auto text-xs text-muted-foreground">
                {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The retiring hero's image for a `living_legend` meta, if the hero (and its art) resolve. */
function resolveHeroImage(
  meta: MetaSummary,
  heroesById: Map<string, { name: string; imageUrl: string | null }>,
): { name: string; imageUrl: string } | null {
  if (meta.changeReason !== "living_legend" || !meta.changeReasonHeroId) {
    return null;
  }
  const hero = heroesById.get(meta.changeReasonHeroId);
  return hero?.imageUrl ? { name: hero.name, imageUrl: hero.imageUrl } : null;
}

/**
 * The card's leading full-height panel, chosen by the meta's change reason. Product art is
 * centered; hero art is anchored to the top so faces aren't cropped. Falls back to the neutral
 * Target whenever there is no reason (or a `living_legend` meta whose hero art can't be resolved).
 */
function MetaChangeReasonPanel({
  meta,
  heroImage,
}: {
  meta: MetaSummary;
  heroImage: { name: string; imageUrl: string } | null;
}) {
  const frame = "w-24 shrink-0 self-stretch";

  if (meta.changeReason === "product_release" && meta.changeReasonImageUrl) {
    return (
      <div className={`${frame} bg-muted`}>
        <img
          src={meta.changeReasonImageUrl}
          alt={meta.name}
          className="h-full w-full object-cover object-center"
        />
      </div>
    );
  }

  if (heroImage) {
    return (
      <div className={`${frame} bg-muted`}>
        <img
          src={heroImage.imageUrl}
          alt={heroImage.name}
          className="h-full w-full object-cover object-top"
        />
      </div>
    );
  }

  if (meta.changeReason === "ban_list") {
    return (
      <div className={`${frame} grid place-items-center bg-accent text-accent-foreground`}>
        <Ban className="size-6" role="img" aria-label="Ban list update" />
      </div>
    );
  }

  return (
    <div className={`${frame} grid place-items-center bg-accent text-accent-foreground`}>
      <Target className="size-6" aria-hidden="true" />
    </div>
  );
}
