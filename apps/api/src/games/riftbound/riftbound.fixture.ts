import type { RawCardRecord } from "../game-adapter.interface.js";

/**
 * A small hand-built Riftcodex fixture mirroring the real card response shape
 * (confirmed against https://api.riftcodex.com/cards at build time, anchored on
 * the live "Pakaa Cub" record), used so adapter and sync tests never hit the
 * network. Covers: a Legend (drives `deriveHeroes`, mapping Domain -> classes and
 * Region -> talents), a Unit with multi-value tags/domain, a card whose
 * `media.image_url` is null (image fallback), a record with no `media` object at
 * all, and two records that share a `name` (an alternate-art printing) so the
 * name-only card identity collapses them to one. Field names match the live API.
 */
export const RIFTBOUND_CARD_FIXTURE: RawCardRecord[] = [
  {
    id: "rc-legend-yasuo",
    name: "Yasuo, the Unforgiven",
    riftbound_id: "OGN-001",
    tcgplayer_id: "700001",
    collector_number: 1,
    attributes: { energy: null, might: null, power: 4 },
    classification: { type: "Legend", supertype: null, rarity: "Epic", domain: ["Fury", "Order"] },
    text: {
      rich: "<p>Once per turn...</p>",
      plain: "Once per turn...",
      flavour: "Death is like the wind.",
    },
    set: { set_id: "OGN", label: "Origins" },
    media: {
      image_url: "https://cards.test/yasuo.png",
      artist: "Riot Games",
      accessibility_text: "Riftbound Legend: Yasuo, the Unforgiven.",
    },
    tags: ["Ionia"],
    orientation: "portrait",
    metadata: {
      clean_name: "Yasuo the Unforgiven",
      updated_on: "2026-07-10T22:45:18.029861+00:00",
      alternate_art: false,
      overnumbered: false,
      signature: false,
    },
    new: false,
  },
  {
    id: "rc-unit-pakaa",
    name: "Pakaa Cub",
    riftbound_id: "OPP-135-298",
    tcgplayer_id: "662913",
    collector_number: 135,
    attributes: { energy: 3, might: 3, power: null },
    classification: { type: "Unit", supertype: null, rarity: "Promo", domain: ["Body"] },
    text: { rich: "<p>[Hidden]</p>", plain: "[Hidden]", flavour: "Oh it's so cute!" },
    set: { set_id: "OPP", label: "Riftbound Organized Play Promotional Cards" },
    media: {
      image_url: "https://cards.test/pakaa.png",
      artist: "Bubble Cat Studio",
      accessibility_text: "Riftbound Unit: Pakaa Cub.",
    },
    tags: ["Cat", "Ixtal"],
    orientation: "portrait",
    metadata: {
      clean_name: "Pakaa Cub",
      updated_on: "2026-07-10T22:45:18.029861+00:00",
      alternate_art: false,
      overnumbered: false,
      signature: false,
    },
    new: false,
  },
  {
    // Alternate-art printing of "Pakaa Cub": a distinct externalId, same name, so
    // the name-only card identity collapses it with the record above.
    id: "rc-unit-pakaa-alt",
    name: "Pakaa Cub",
    riftbound_id: "OPP-135-ALT",
    tcgplayer_id: "662914",
    collector_number: 135,
    attributes: { energy: 3, might: 3, power: null },
    classification: { type: "Unit", supertype: null, rarity: "Promo", domain: ["Body"] },
    text: { rich: "<p>[Hidden]</p>", plain: "[Hidden]", flavour: "Oh it's so cute!" },
    set: { set_id: "OPP", label: "Riftbound Organized Play Promotional Cards" },
    media: {
      image_url: "https://cards.test/pakaa-alt.png",
      artist: "Bubble Cat Studio",
      accessibility_text: "Riftbound Unit: Pakaa Cub (alternate art).",
    },
    tags: ["Cat", "Ixtal"],
    orientation: "portrait",
    metadata: {
      clean_name: "Pakaa Cub",
      updated_on: "2026-07-10T22:45:18.029861+00:00",
      alternate_art: true,
      overnumbered: false,
      signature: false,
    },
    new: false,
  },
  {
    id: "rc-spell-noimg",
    name: "Last Breath",
    riftbound_id: "OGN-042",
    tcgplayer_id: "700042",
    collector_number: 42,
    attributes: { energy: 2, might: null, power: null },
    classification: { type: "Spell", supertype: null, rarity: "Rare", domain: ["Calm"] },
    text: { rich: "<p>Deal 2.</p>", plain: "Deal 2.", flavour: "" },
    set: { set_id: "OGN", label: "Origins" },
    // A missing image: image_url is null and must map to null, not a crash.
    media: { image_url: null, artist: "", accessibility_text: "" },
    tags: [],
    orientation: "portrait",
    metadata: {
      clean_name: "Last Breath",
      updated_on: "2026-07-10T22:45:18.029861+00:00",
      alternate_art: false,
      overnumbered: false,
      signature: false,
    },
    new: false,
  },
  {
    // A Battlefield with no `media` object at all — the mapper must tolerate it.
    id: "rc-battlefield-abyss",
    name: "Howling Abyss",
    riftbound_id: "OGN-200",
    tcgplayer_id: "700200",
    collector_number: 200,
    attributes: { energy: null, might: null, power: null },
    classification: {
      type: "Battlefield",
      supertype: null,
      rarity: "Common",
      domain: ["Colorless"],
    },
    text: { rich: "", plain: "", flavour: "" },
    set: { set_id: "OGN", label: "Origins" },
    tags: [],
    orientation: "landscape",
    metadata: {
      clean_name: "Howling Abyss",
      updated_on: "2026-07-10T22:45:18.029861+00:00",
      alternate_art: false,
      overnumbered: false,
      signature: false,
    },
    new: false,
  },
];
