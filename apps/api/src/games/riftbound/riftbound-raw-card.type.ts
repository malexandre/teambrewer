/**
 * The narrowed Riftcodex source record, from the open Riftbound card API
 * (`GET https://api.riftcodex.com/cards`). Only the fields the lean card/identity
 * models consume are typed here; the full source schema is documented at
 * https://riftcodex.com/docs/endpoints/cards/ and confirmed at build time.
 *
 * Field notes (confirmed against the live API): `id` is the stable per-printing
 * Riftcodex identifier; a card printed as alternate art appears as multiple
 * records sharing a `name`; the identity concept ("Legend") is a card whose
 * `classification.type` is "Legend"; `classification.domain` is the color/faction
 * axis and `tags` carry the LoL region (plus subtypes); card art lives on
 * `media.image_url`, which may be null. Riftbound has no pitch resource.
 */

export interface RiftcodexClassification {
  type: string;
  supertype: string | null;
  rarity: string;
  domain: string[];
}

export interface RiftcodexMedia {
  image_url: string | null;
  artist: string;
  accessibility_text: string;
}

export interface RiftcodexRawCard {
  id: string;
  name: string;
  riftbound_id: string;
  classification: RiftcodexClassification;
  media?: RiftcodexMedia;
  tags: string[];
}

/** One page of the paginated `GET /cards` response. */
export interface RiftcodexCardsPage {
  items: unknown[];
  total: number;
  page: number;
  size: number;
  pages: number;
}
