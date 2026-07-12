/**
 * The catalog of supported games. `id` is the stable slug stored in `Team.gameId`
 * and used as `Game.id`; `key` is the adapter/registry key. Adding a game means
 * adding its adapter (GamesModule) and an entry here — no other core change.
 * This lists *which* games exist; each game's specifics stay behind its adapter.
 */
export interface GameCatalogEntry {
  id: string;
  key: string;
  name: string;
}

export const GAME_CATALOG: readonly GameCatalogEntry[] = [
  { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" },
  { id: "riftbound", key: "riftbound", name: "Riftbound" },
];
