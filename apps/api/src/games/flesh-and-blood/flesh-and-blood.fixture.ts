import type { RawCardRecord } from "../game-adapter.interface.js";

/**
 * A small hand-built the-fab-cube fixture mirroring the real record structure,
 * used so adapter and sync tests never hit the network. Covers: a card at two
 * pitch values (distinct identities), a hero (class + supertype in `types`), a
 * hero with a talent, and a card whose first printing has no image (to exercise
 * representative-image selection). Field names match the live dataset.
 */
export const FLESH_AND_BLOOD_CARD_FIXTURE: RawCardRecord[] = [
  {
    unique_id: "absorb-aether-1",
    name: "Absorb in Aether",
    pitch: "1",
    health: "",
    types: ["Instant"],
    printings: [{ set_printing_unique_id: "AiA001", image_url: "https://cards.test/AiA001.webp" }],
  },
  {
    unique_id: "absorb-aether-3",
    name: "Absorb in Aether",
    pitch: "3",
    health: "",
    types: ["Instant"],
    printings: [{ set_printing_unique_id: "AiA003", image_url: "https://cards.test/AiA003.webp" }],
  },
  {
    unique_id: "arakni-hero",
    name: "Arakni",
    pitch: "",
    health: "20",
    types: ["Assassin", "Hero", "Young"],
    printings: [{ set_printing_unique_id: "ARK001", image_url: "https://cards.test/ARK001.webp" }],
  },
  {
    unique_id: "briar-hero",
    name: "Briar, Warden of Thorns",
    pitch: "",
    health: "20",
    types: ["Elemental", "Runeblade", "Hero", "Young"],
    printings: [{ set_printing_unique_id: "WTR001", image_url: "https://cards.test/WTR001.webp" }],
  },
  {
    unique_id: "no-first-image",
    name: "Sink Below",
    pitch: "3",
    health: "",
    types: ["Defense Reaction"],
    printings: [
      // Ordered first by set_printing_unique_id but missing art — the mapper must
      // skip it and use the next printing's image.
      { set_printing_unique_id: "AAA000", image_url: "" },
      { set_printing_unique_id: "BBB111", image_url: "https://cards.test/BBB111.webp" },
    ],
  },
];
