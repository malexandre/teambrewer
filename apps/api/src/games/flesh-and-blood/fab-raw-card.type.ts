/**
 * The narrowed Flesh and Blood source record, from the-fab-cube open dataset
 * (`json/english/card.json`). Only the fields the lean card model consumes are
 * typed here; the full source schema is documented at
 * https://the-fab-cube.github.io/flesh-and-blood-cards/ and pulled at build time.
 *
 * Field notes (confirmed against the dataset): `unique_id` is the stable per-card
 * id; `pitch`/`health` are strings that may be blank; a card that exists at
 * multiple pitch values appears as multiple records sharing a `name`; heroes are
 * records whose `types` include "Hero"; card art lives on `printings[].image_url`.
 */

export interface FabRawPrinting {
  set_printing_unique_id: string;
  image_url: string | null;
}

export interface FabRawCard {
  unique_id: string;
  name: string;
  /** "", "1", "2", "3" — blank when the card has no pitch. */
  pitch: string;
  /** "", "20" — a hero's starting life; blank for non-heroes. */
  health: string;
  types: string[];
  printings: FabRawPrinting[];
  /**
   * Per-format legality booleans (verified against the card schema at the pinned
   * v8.2.0 tag: https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/v8.2.0/web/json-schemas/card-schema.html).
   * A card legal in a format has the matching `*_legal` set true; the
   * `*_living_legend` markers flag a card retired to the Living Legend format (so
   * it is no longer legal in Classic Constructed / Blitz even though `*_legal`
   * may remain true).
   */
  cc_legal: boolean;
  blitz_legal: boolean;
  commoner_legal: boolean;
  ll_legal: boolean;
  silver_age_legal: boolean;
  cc_living_legend: boolean;
  blitz_living_legend: boolean;
}
