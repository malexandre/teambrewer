import { Injectable } from "@nestjs/common";

import type {
  CardSourceDescription,
  FormatDefinition,
  GameAdapter,
  NormalizedCard,
  NormalizedHero,
  RawCardRecord,
  RecognizedDeckUrl,
} from "../game-adapter.interface.js";
import { FabCardSourceClient } from "./fab-card-source.client.js";
import { FLESH_AND_BLOOD_FORMATS } from "./fab-formats.js";
import type { FabRawCard, FabRawPrinting } from "./fab-raw-card.type.js";

/** The dataset's identity type: a hero card carries this in its `types`. */
const HERO_TYPE = "Hero";

/** FaB talents, which appear alongside the class in a hero's `types`. */
const FLESH_AND_BLOOD_TALENTS = new Set([
  "Light",
  "Shadow",
  "Elemental",
  "Ice",
  "Lightning",
  "Earth",
  "Chaos",
  "Royal",
  "Draconic",
]);

/** FaB hero supertypes — not a class or talent. */
const FLESH_AND_BLOOD_HERO_SUPERTYPES = new Set(["Young", "Adult", "Token"]);

/**
 * The Flesh and Blood {@link GameAdapter} — the reference adapter implementation.
 * Maps the-fab-cube records into the lean normalized card/hero, defines the FaB
 * card identity (name + pitch), and recognizes Fabrary deck links. All FaB
 * specifics live here; nothing leaks into the core.
 */
@Injectable()
export class FleshAndBloodAdapter implements GameAdapter {
  readonly key = "flesh_and_blood";
  readonly displayName = "Flesh and Blood";
  readonly identityLabel = "Hero";

  constructor(private readonly source: FabCardSourceClient) {}

  listFormats(): FormatDefinition[] {
    return FLESH_AND_BLOOD_FORMATS.map((format) => ({ ...format }));
  }

  describeSource(): CardSourceDescription {
    return {
      sourceName: "the-fab-cube/flesh-and-blood-cards",
      sourceUrl: this.source.sourceUrl,
      sourceVersion: this.source.sourceVersion,
    };
  }

  fetchCardSource(): Promise<RawCardRecord[]> {
    return this.source.fetchRawCards();
  }

  mapCard(record: RawCardRecord): NormalizedCard {
    const card = record as unknown as FabRawCard;
    return {
      externalId: card.unique_id,
      name: card.name,
      pitch: parseNumericField(card.pitch),
      imageUrl: selectRepresentativeImageUrl(card.printings),
    };
  }

  deriveHeroes(records: RawCardRecord[]): NormalizedHero[] {
    const heroes: NormalizedHero[] = [];
    const seenExternalIds = new Set<string>();
    for (const record of records) {
      const card = record as unknown as FabRawCard;
      if (!card.types?.includes(HERO_TYPE) || seenExternalIds.has(card.unique_id)) {
        continue;
      }
      seenExternalIds.add(card.unique_id);
      heroes.push({
        externalId: card.unique_id,
        name: card.name,
        classes: card.types.filter(
          (type) =>
            type !== HERO_TYPE &&
            !FLESH_AND_BLOOD_TALENTS.has(type) &&
            !FLESH_AND_BLOOD_HERO_SUPERTYPES.has(type),
        ),
        talents: card.types.filter((type) => FLESH_AND_BLOOD_TALENTS.has(type)),
        startingLife: parseNumericField(card.health),
        imageUrl: selectRepresentativeImageUrl(card.printings),
      });
    }
    return heroes;
  }

  cardIdentity(card: NormalizedCard): string {
    return `${card.name}#${card.pitch ?? "-"}`;
  }

  recognizeDeckUrl(url: string): RecognizedDeckUrl | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.hostname !== "fabrary.net" && parsed.hostname !== "www.fabrary.net") {
      return null;
    }
    // Fabrary deck URLs look like https://fabrary.net/decks/<id>.
    const match = parsed.pathname.match(/^\/decks\/([^/]+)/);
    const externalId = match?.[1];
    return externalId ? { provider: "fabrary", externalId } : { provider: "fabrary" };
  }
}

/** Parse a dataset string field ("", "1", "20") to a number, or null when blank/non-numeric. */
function parseNumericField(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pick a deterministic image for the card: the first printing (ordered by
 * `set_printing_unique_id`) that has a non-empty image, else the first printing's
 * image, else null. Deterministic so re-sync is stable.
 */
function selectRepresentativeImageUrl(printings: FabRawPrinting[] | undefined): string | null {
  if (!printings || printings.length === 0) {
    return null;
  }
  const ordered = [...printings].sort((left, right) =>
    left.set_printing_unique_id.localeCompare(right.set_printing_unique_id),
  );
  const withImage = ordered.find((printing) => printing.image_url && printing.image_url.trim() !== "");
  return withImage?.image_url ?? ordered[0]?.image_url ?? null;
}
