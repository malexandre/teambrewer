# Personas & Use Cases

## Personas

### Priya — Instance-admin (also plays)
Runs the self-hosted instance for her playgroup. Creates the teams (*Rosette* for Flesh and Blood, a
separate one for Riftbound), invites people by generating setup links she pastes into the team's Discord.
Cares about privacy, low maintenance, and that the two teams never bleed into each other. Also an active
member of the FaB team.

### Marc — Team-admin & captain
Organizes the FaB team's prep for the next big event. Sets up the event, builds the gauntlet, assigns
expected metagame shares, and assigns matchups to test so the bogeyman decks actually get piloted. Wants
to see coverage gaps at a glance and drive a confident deck choice.

### Sam — Member (grinder)
Plays a lot, mostly on paper and some on a digital client. Logs games quickly from a phone right after
playing, rating each game's confidence honestly. Reads game-plans before a matchup, and proposes tech
cards to try when something isn't working.

### Alex — Member (theorist)
Loves brewing and analysis. Writes primers and matchup writeups, comments on suggestions, and studies the
matchup matrix to find under-explored angles. Rarely logs many games but shapes the team's thinking.

## Key use cases (user journeys)

### UC-1 — Onboard a new member (no email)
1. Instance-admin or team-admin creates the account and generates a **setup link**.
2. Admin shares the link manually (e.g. Discord DM).
3. The user opens it, sets a password, and **must set up TOTP 2FA** (scans a QR code) and saves backup codes.
4. The user lands in their team; if they belong to several teams, they pick the **active team**.
→ See [`../features/accounts-and-auth.md`](../features/accounts-and-auth.md), [`../features/teams-and-membership.md`](../features/teams-and-membership.md).

### UC-2 — Add a deck to work on
1. A member creates a deck: hero, format, an external link (e.g. Fabrary), a name, tags, visibility.
2. They set its status (e.g. *testing*) and can keep it a private draft until ready.
→ See [`../features/decks.md`](../features/decks.md).

### UC-3 — Set up a tournament and its gauntlet
1. A team-admin creates an **event** (format, date, importance).
2. They build the **gauntlet** from reference decks (link-only) and assign **expected metagame** shares.
3. They create **test assignments** so specific matchups get covered.
→ See [`../features/events-and-gauntlets.md`](../features/events-and-gauntlets.md).

### UC-4 — Log a game with confidence
1. After a game, a member records: our deck vs opponent deck/archetype, format, first/second player, best-of,
   result, **confidence factors**, win-type/loss-reason, and learnings.
2. The game feeds the confidence-weighted matchup matrix and coverage tracker.
→ See [`../features/game-logging.md`](../features/game-logging.md), [`../features/confidence-and-matchups.md`](../features/confidence-and-matchups.md).

### UC-5 — Read the meta and fill the gaps
1. A member opens the **matchup matrix** for the event's format: weighted win rates with sample sizes and
   trust indicators.
2. The **coverage tracker** highlights thin matchups and who's assigned to them.
3. They log games where data is weakest.
→ See [`../features/confidence-and-matchups.md`](../features/confidence-and-matchups.md).

### UC-6 — Propose and resolve a tech card
1. A member proposes "try card X over card Y in this deck," with reasoning.
2. Teammates discuss and vote; the suggestion moves through *proposed → testing → adopted/rejected*.
→ See [`../features/testing-queue.md`](../features/testing-queue.md).

### UC-7 — Prepare game-plans and pick the deck
1. The team writes **game-plans** for each (our deck × top archetype) matchup.
2. Members record their **deck selection** for the event; the team-admin can lock it.
3. After the event, the team writes a **retrospective**.
→ See [`../features/gameplans-and-deck-selection.md`](../features/gameplans-and-deck-selection.md).

### UC-8 — Capture and find knowledge
1. Members write **primers** and log **decisions**; run **polls** (e.g. "which deck for Nationals?").
2. Discussion happens inline via comments and **@mentions**, surfaced in the **notification center**.
→ See [`../features/team-knowledge.md`](../features/team-knowledge.md), [`../features/collaboration-core.md`](../features/collaboration-core.md).

### UC-9 — Switch between my teams
1. A user in both the FaB and Riftbound teams uses the **active-team selector**; the UI only ever shows
   one team's data.
→ See [`../features/teams-and-membership.md`](../features/teams-and-membership.md), [`../architecture/multi-tenancy.md`](../architecture/multi-tenancy.md).
