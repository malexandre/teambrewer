# ADR-0006: Game-agnostic core with per-game adapters

- **Status:** Accepted (2026-07-11)
- **Context:** Primary game is Flesh and Blood; the user would like Riftbound to work too, later. Building
  both now is wasteful; hard-coding FaB risks a painful refactor. Teams are bound to one game
  ([ADR-0008](0008-multi-tenant-teams.md)).

## Decision

Build a **game-agnostic core** with a **GameAdapter** interface that isolates all game-specific concerns
(identity term, formats, card schema/source, deck-link recognition, display labels). **Implement the FaB
adapter fully first**; add the **Riftbound adapter later** (phase-12). Core features never import
game-specific code — they resolve the adapter by the team's game.

Contract and boundaries: [`../architecture/game-abstraction.md`](../architecture/game-abstraction.md).

## Consequences

- Adding Riftbound is a contained job (new adapter + reference data), not a core rewrite. If core changes
  are needed for a new game, the abstraction leaked — fix the boundary.
- Core code stays free of "hero"/"pitch"/FaB-format assumptions.
- Small upfront cost: designing the adapter seam while building FaB (the reference implementation).

## Alternatives considered

- **Build FaB + Riftbound now** — rejected: extra work/testing for a game that may not be needed soon.
- **Hard-code FaB** — rejected: a future Riftbound need would force a refactor; the seam is cheap to add
  now.
