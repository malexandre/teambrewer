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
}
