# Product Vision

## The problem

Competitive TCG teams do their best work together: testing decks, sharing tech, and figuring out the
matchups that decide tournaments. But that knowledge is scattered across group chats, spreadsheets, and
people's heads. Results are shared as raw claims ("this matchup is unwinnable") with no sense of how much
to trust them. Nobody wants to pilot the "bogeyman" deck in a gauntlet, so coverage has holes. When a
tournament arrives, the team can't easily answer: *what should we bring, and how confident are we?*

## What TeamBrewer is

TeamBrewer is a **private, team-first workspace for cracking the meta**. It turns a team's scattered
testing into structured, trustworthy, shared knowledge, organized around the tournaments that matter.

Its opinionated core:

- **Trust is first-class.** Every logged game carries structured confidence factors (how evenly matched
  the pilots were, how serious the games were, how tuned the decks were, how familiar the pilot was).
  Matchup win rates are **confidence-weighted and always show their sample size**, so the team can tell
  a real read from a hunch.
- **Testing is organized around events.** A target tournament defines the format, the field to beat (the
  gauntlet), and the expected metagame — so effort goes where it matters most.
- **Collaboration over card-entry.** Decks are referenced by link; the app layers the collaboration a
  team actually needs on top — card-test suggestions, matchup game-plans, primers, discussion, and
  assignments — powered by a rich, searchable card database.

## Who it's for

A single competitive team of roughly 10–30 players (see [personas](personas-and-use-cases.md)). One
instance can host several **isolated teams** — e.g. a Flesh and Blood squad and a Riftbound squad — that
never see each other's data.

## Goals

1. **Make results trustworthy.** No more unqualified claims — every result carries confidence and sample.
2. **Make the meta legible.** A confidence-weighted matchup matrix and coverage tracker show, at a glance,
   what the team knows and what it still needs to test.
3. **Make tournament prep deliberate.** Events tie together the gauntlet, expected metagame, assignments,
   deck selection, and a post-event retrospective.
4. **Make knowledge stick.** Primers, decisions logs, and threaded discussion keep conclusions from
   getting lost in chat.
5. **Stay private and simple to run.** Invite-only, 2FA, self-hosted on a single VPS.

## Non-goals

- **Not a deck builder.** Decks are links to tools the team already uses (e.g. Fabrary). See
  [ADR-0002](../decisions/0002-decks-as-links.md).
- **Not a scraper or a public meta site.** No automated harvesting of third-party data. External context
  is referenced by link. See [ADR-0007](../decisions/0007-external-data-approach.md).
- **Not a public, open-signup community.** Access is admin-granted only.
- **Not a marketplace / collection / pricing tracker.** Card prices are explicitly out of scope.
- **Not a live game engine.** All results are logged by humans after playing (paper or digital client).

## What success looks like

Before a tournament, a team member opens TeamBrewer, sees the event's gauntlet weighted by expected
metagame, sees which matchups are well-tested and which are thin, reads the current game-plan for their
deck against the top archetypes, logs a few more games to fill the gaps, and the team makes a deck choice
backed by confidence-weighted data rather than vibes — then captures the outcome in a retrospective that
makes the next event easier.
