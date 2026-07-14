# Domain: Flesh and Blood (FaB)

Enough Flesh and Blood knowledge to build TeamBrewer correctly. This is not a rules manual — it captures
the concepts the data model and features depend on. For exact card-schema fields, see
[`card-data-sources.md`](card-data-sources.md).

> FaB is published by Legend Story Studios (LSS). Rules, formats, and the Banned & Restricted list change
> over time — **verify current specifics against official sources when implementing**
> ([fabtcg.com](https://fabtcg.com/), [rules & policy center](https://fabtcg.com/rules-and-policy-center/)).

## Heroes, classes, talents

- A deck is built around a **Hero**. The hero defines the deck's identity and constrains which cards are
  legal in it. **The competitive meta is tracked per hero** (e.g. "Kassai", "Dorinthea", "Fang").
- **Class** (e.g. Warrior, Guardian, Ninja, Runeblade, Wizard, Ranger, Brute, Mechanologist, Illusionist,
  Assassin, Merchant/adjacent) and **Talent** (e.g. Light, Shadow, Elemental, Ice, Lightning, Earth,
  Chaos, Royal) gate which non-generic cards a hero may include. **Generic** cards can go in any deck.
- Heroes have a starting **Life** total (and often a starting **weapon** and **equipment**).

## Card anatomy (fields that matter to us)

- **Pitch** — the resource value when a card is pitched, shown by color: **red = 1, yellow = 2, blue = 3**.
  The same card name often exists at multiple pitch values; **name + pitch is effectively the unique
  identity** in decklists. This matters for card search/autocomplete.
- **Cost** — resources to play the card.
- **Power / Defense** — attack value / defense value (where applicable).
- **Card types** — e.g. Action, Attack Action, Defense Reaction, Attack Reaction, Instant, Equipment,
  Weapon, plus subtypes (e.g. Aura, Item, Arrow) and supertypes (e.g. Young, Ally, Token).
- **Keywords** — e.g. Go again, Dominate, Overpower, Reprise, Fusion, Arcane, etc.
- **Text / abilities**, **rarity**, **artist**, **sets/printings** (including foil variants).
- **Legality per format** — the dataset tracks per-format legality flags (`cc_legal`, `blitz_legal`,
  `commoner_legal`, `ll_legal`, `silver_age_legal`) plus Living-Legend markers (`cc_living_legend`,
  `blitz_living_legend`) that demote a retired hero out of CC and Blitz even while its `*_legal` flag
  stays true. *(TeamBrewer's lean `Card` model does not store these — the card image conveys them — but
  the `Hero` model does store a derived `legalFormatKeys`, mapped from these flags by the FaB adapter, so
  the meta hero picker can narrow by format. See [card-database](../features/card-database.md).)*

TeamBrewer stores **card reference data** (global per game) — it does not store deck card-lists (decks are
links). Cards power autocomplete, hover-preview, and references inside suggestions, game-plans, and
primers.

## Formats (as of 2026 — verify before building format-aware features)

| Format | Notes |
|---|---|
| **Classic Constructed (CC)** | Premier constructed format. Large deck (60+), tightly tuned; the main event format for most big tournaments. |
| **Blitz** | Fast 40-card format. **Singleton (max 1 copy of each card) since Jan 1, 2026**; Living Legend heroes returned to Blitz at that time. |
| **Living Legend (LL)** | Restricts heroes that have accumulated Living Legend points (removing them from CC), keeping older/stronger heroes in their own format. |
| **Silver Age (SAGE)** | Newer 2026 curated/rotating constructed format positioned as a second major competitive format. |
| **Golden Age** | Broader "everything" constructed pool. |
| **Draft / Sealed** | Limited formats built from freshly opened product. |

Formats are **game-specific data** owned by the FaB game adapter (see
[`../architecture/game-abstraction.md`](../architecture/game-abstraction.md)). Do not hard-code the format
list in shared/core code.

## Living Legend, rotation, Banned & Restricted

- **Living Legend points** accrue to heroes for high tournament finishes; once a hero "reaches Living
  Legend," it rotates out of CC into the LL format. This means the set of competitively-relevant heroes
  shifts over time.
- The **Banned & Restricted** list changes periodically per format. TeamBrewer does not enforce legality
  (decks are links), but format tags and card legality flags should reflect reality; treat B&R as
  reference context, not a validation engine.

## What this implies for TeamBrewer

- **Hero is a first-class structured field on a deck**, even though the card list is not stored. Matchup
  matrices and meta can be aggregated **by hero** as well as by deck.
- **Format is a structured field** on decks, events, and games; the legal format set comes from the game
  adapter.
- **Opponents can be identified by hero/archetype** even without a full list — useful for gauntlet
  entries and game logging against the field.
- **Card identity = name + pitch** for search/reference UX.
- No sideboards in the MTG sense; "sideboard guides" in TeamBrewer are **matchup game-plans** (equipment/
  weapon/card choices and lines for a matchup), see
  [`../features/gameplans-and-deck-selection.md`](../features/gameplans-and-deck-selection.md).
