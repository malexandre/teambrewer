/**
 * The GameAdapter seam (ADR-0006, docs/architecture/game-abstraction.md).
 *
 * All game-specific knowledge — the identity concept, the format list, the card
 * data source and its schema mapping, and recognized deck-link providers — lives
 * behind this interface. The core never imports a game adapter directly; it
 * resolves one by a team's game key through the {@link GameAdapterRegistry}, and
 * that resolution only happens during card sync. Card/format/hero *reads* are
 * pure `gameId` filters and never touch an adapter.
 *
 * Flesh and Blood is the reference implementation; adding a game (e.g. Riftbound,
 * phase-12) must be only a new adapter + reference data, never a core change.
 */

/**
 * An untyped record from a game's card data source. The core stays
 * schema-agnostic — each adapter narrows this to its own source shape internally.
 */
export type RawCardRecord = Record<string, unknown>;

/**
 * A card mapped into the lean, game-agnostic reference shape stored in `Card`.
 * Cards are reference data only (decks are links, ADR-0002): just enough to
 * reference a card by search/autocomplete and show its image.
 */
export interface NormalizedCard {
  /** Stable source identifier — unique per game (`Card.externalId`). */
  externalId: string;
  name: string;
  /** Game-specific resource identity component (FaB pitch); null when absent. */
  pitch: number | null;
  imageUrl: string | null;
}

/** A hero/identity derived from a game's card dataset, mapped into `Hero`. */
export interface NormalizedHero {
  externalId: string;
  name: string;
  classes: string[];
  talents: string[];
  startingLife: number | null;
  imageUrl: string | null;
}

/** A play format definition the core stores as a `Format` row for the game. */
export interface FormatDefinition {
  key: string;
  name: string;
  isConstructed: boolean;
  sortOrder: number;
}

/** A deck link recognized as belonging to a known provider (link only, no scraping). */
export interface RecognizedDeckUrl {
  provider: string;
  externalId?: string;
}

/** The contract every supported game implements. */
export interface GameAdapter {
  /** Matches `Game.key` (e.g. "flesh_and_blood"); the registry key. */
  readonly key: string;
  readonly displayName: string;
  /** The game's word for its identity concept (e.g. "Hero", "Legend"). */
  readonly identityLabel: string;

  /** The game's play formats, stored as `Format` rows by the seed. */
  listFormats(): FormatDefinition[];

  /** Fetch the raw card dataset from the sanctioned open source. */
  fetchCardSource(): Promise<RawCardRecord[]>;

  /** Map one raw record into the lean normalized card. */
  mapCard(record: RawCardRecord): NormalizedCard;

  /** Derive the game's heroes/identities from the raw card dataset. */
  deriveHeroes(records: RawCardRecord[]): NormalizedHero[];

  /**
   * The game's card identity string (FaB: name + pitch), used to distinguish
   * cards that share a name but differ in identity (a named card at multiple
   * pitch values is multiple distinct cards).
   */
  cardIdentity(card: NormalizedCard): string;

  /**
   * Recognize an external deck URL as a known provider's (link recognition only,
   * ToS-safe; never scrapes deck contents). Provided here, consumed by decks in
   * phase-03. Optional — a game may recognize no providers.
   */
  recognizeDeckUrl?(url: string): RecognizedDeckUrl | null;
}
