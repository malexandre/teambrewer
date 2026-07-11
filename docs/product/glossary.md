# Glossary

Shared vocabulary for TeamBrewer. Terms are split into **app/domain concepts** and **TCG terms**. Use
these exact names in code and UI (see the no-abbreviations rule in
[`coding-standards.md`](../../.claude/rules/coding-standards.md)).

## App concepts

| Term | Meaning |
|---|---|
| **Instance** | A single self-hosted deployment of TeamBrewer. Hosts many teams. |
| **Instance-admin** | Super-admin of the instance. Creates teams and invites people. |
| **Team** | An isolated workspace bound to one game (e.g. *Rosette* = Flesh and Blood). All domain data belongs to exactly one team. Also called a **workspace**. |
| **Team-admin** | Manages a specific team's membership and content. Not an instance-admin. |
| **Member** | A regular user within a team. Creates decks, logs games, comments, etc. |
| **Membership** | The link between a user and a team, carrying that user's role in that team. |
| **Active team** | The team a multi-team user is currently viewing. The UI shows one team at a time. |
| **Tenant isolation** | The guarantee that one team never sees another team's data. Enforced server-side. |
| **Deck** | A **link-only** entry: `{ game, format, hero, external link, metadata }`. No stored card list. |
| **Reference deck** | A deck representing an opponent/meta archetype (gauntlet target), also link-only. |
| **Event** | A target tournament (format + date) that testing is organized around. |
| **Gauntlet** | The "field to beat" for an event: the set of reference decks/archetypes to test against. |
| **Expected metagame** | Field-share percentages assigned to gauntlet archetypes, used to prioritize testing. |
| **Game (log)** | A single recorded game/match result between two sides, with confidence factors. |
| **First player / second player** | Which side took the first turn (`firstPlayerSide`). We use first/second player, **not** MTG's "on the play / on the draw". |
| **Confidence factors** | Structured inputs (skill parity, seriousness, deck maturity, pilot familiarity) that combine into a game's confidence weight. |
| **Confidence weight** | A value in `[0,1]` derived from a game's confidence factors; used to weight aggregates. |
| **Matchup** | An aggregation of games between two decks/heroes, producing a confidence-weighted win rate. |
| **Matchup matrix** | The grid of matchups across the team's decks and the gauntlet. |
| **Effective sample** | `Σ(confidence weights)` for a matchup — a trust-adjusted sample size. |
| **Trust indicator** | A low/medium/high badge derived from the effective sample. |
| **Coverage tracker** | A view of which matchups still lack sufficient (confidence-weighted) data, and who's testing what. |
| **Card-test suggestion** | A proposal to try card X (optionally over card Y) in a specific deck, with reasoning and a status. |
| **Test assignment** | A tracked task to test a specific deck against a specific archetype. |
| **Game-plan** | A written guide for a specific (our deck × opponent archetype) matchup. |
| **Deck selection** | What a member commits to bringing to an event (can be locked). |
| **Retrospective** | The post-event review capturing results and learnings. |
| **Primer** | A long-form team knowledge document (deck primer, matchup writeup, format notes). |
| **Decisions log** | A record of what the team settled on and why. |
| **Game adapter** | The pluggable module encapsulating one TCG's rules/formats/card schema (see [game-abstraction](../architecture/game-abstraction.md)). |

## Flesh and Blood terms

See [`../domain/flesh-and-blood.md`](../domain/flesh-and-blood.md) for detail.

| Term | Meaning |
|---|---|
| **Hero** | The character a deck is built around; defines class/talent and constrains legal cards. Meta is tracked per hero. |
| **Class / Talent** | Card affinities (e.g. class *Warrior*, talent *Light*) that gate which cards a hero can play. |
| **Pitch** | A card's resource value, shown by color: **red = 1, yellow = 2, blue = 3**. |
| **Cost** | Resources needed to play a card. |
| **Card types** | Action, Attack Action, Defense Reaction, Attack Reaction, Instant, Equipment, Weapon, etc. |
| **Classic Constructed (CC)** | The premier 60+ card singleton-ish constructed format. |
| **Blitz** | Fast 40-card format; **singleton (max 1 copy per card) as of Jan 2026**. |
| **Living Legend (LL)** | Format restricting heroes that have accumulated "Living Legend" points. |
| **Silver Age (SAGE)** | Newer rotating/curated constructed format (2026). |
| **Draft / Sealed** | Limited formats built from freshly opened product. |
| **Living Legend points** | Points a hero earns from high finishes; drive rotation out of some formats. |
| **Banned & Restricted (B&R)** | Periodic list of banned/restricted/suspended cards per format. |

## Riftbound terms (built later)

See [`../domain/riftbound.md`](../domain/riftbound.md).

| Term | Meaning |
|---|---|
| **Legend** | The champion/identity a Riftbound deck is built around (analogous to a hero). |
| **Domain** | A color/faction axis constraining deckbuilding. |
| **Region** | League of Legends region tag on cards. |
| **Zones** | The six deck zones a Riftbound deck fills. |
