import { Injectable } from "@nestjs/common";

import type {
  CardSourceDescription,
  FormatDefinition,
  GameAdapter,
  NormalizedCard,
  NormalizedHero,
  RawCardRecord,
} from "../game-adapter.interface.js";
import { RIFTBOUND_FORMATS } from "./riftbound-formats.js";
import type { RiftcodexRawCard } from "./riftbound-raw-card.type.js";
import { RiftcodexCardSourceClient } from "./riftcodex-card-source.client.js";

/** The dataset's identity type: a Legend card carries this in `classification.type`. */
const LEGEND_TYPE = "Legend";

/**
 * The Riftbound {@link GameAdapter}. Maps Riftcodex records into the lean
 * normalized card/identity, defines the Riftbound card identity (name only — no
 * pitch axis), and derives Legends as the identity, mapping Domain onto the
 * generic class surface and Region (tags) onto the generic talent surface. All
 * Riftbound specifics live here; nothing leaks into the core. It recognizes no
 * deck-link providers (decks stay link-only, ADR-0002), so `recognizeDeckUrl` is
 * intentionally omitted (the seam treats it as optional).
 */
@Injectable()
export class RiftboundAdapter implements GameAdapter {
  readonly key = "riftbound";
  readonly displayName = "Riftbound";
  readonly identityLabel = "Legend";
  readonly defaultBestOf = 3 as const;

  constructor(private readonly source: RiftcodexCardSourceClient) {}

  listFormats(): FormatDefinition[] {
    return RIFTBOUND_FORMATS.map((format) => ({ ...format }));
  }

  describeSource(): CardSourceDescription {
    return {
      sourceName: "riftcodex",
      sourceUrl: this.source.sourceUrl,
      sourceVersion: this.source.sourceVersion,
    };
  }

  fetchCardSource(): Promise<RawCardRecord[]> {
    return this.source.fetchRawCards();
  }

  mapCard(record: RawCardRecord): NormalizedCard {
    const card = record as unknown as RiftcodexRawCard;
    return {
      externalId: card.id,
      name: card.name,
      // Riftbound has no pitch resource; the FaB-specific field stays null.
      pitch: null,
      imageUrl: card.media?.image_url ?? null,
    };
  }

  deriveHeroes(records: RawCardRecord[]): NormalizedHero[] {
    const legends: NormalizedHero[] = [];
    const seenExternalIds = new Set<string>();
    for (const record of records) {
      const card = record as unknown as RiftcodexRawCard;
      if (card.classification?.type !== LEGEND_TYPE || seenExternalIds.has(card.id)) {
        continue;
      }
      seenExternalIds.add(card.id);
      legends.push({
        externalId: card.id,
        name: card.name,
        // Domain (color/faction) and Region (tags) map onto the generic class and
        // talent surfaces FaB uses — no Riftbound-only fields in the core.
        classes: [...(card.classification.domain ?? [])],
        talents: [...(card.tags ?? [])],
        startingLife: null,
        imageUrl: card.media?.image_url ?? null,
      });
    }
    return legends;
  }

  cardIdentity(card: NormalizedCard): string {
    return card.name;
  }
}
