# Game Logging v2 — Wizard, game-driven best-of, and card capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the game-logging form into a short wizard, make the pre-selected best-of game-driven via the GameAdapter, and capture optional impressive/underperforming cards (tagged ours/theirs) per game.

**Architecture:** Additive follow-up to phase-06 on branch `feat/game-logging-wizard`. Backend gains a `GameLogCard` join table (scoped through its parent `GameLog` like `Attendance`), a `defaultBestOf` on the adapter, and a `GET /api/game-config` endpoint. Frontend replaces the single-screen `GameLogForm` with a `GameLogWizard` (3 core steps + optional step 4) that reads the game default and captures cards via the existing `CardPicker`.

**Tech Stack:** NestJS 11 + Prisma 7 (Postgres), Zod schemas in `packages/shared`, React + Vite + TanStack Query, Vitest + Testing Library + Testcontainers + Playwright.

## Global Constraints

- **Explicit, readable names** — never abbreviate identifiers (project rule + user preference).
- **Tenant isolation is a security property** — every team-owned query filtered by the verified `teamId`; `GameLogCard` is reached only through its team-scoped parent `GameLog` (no `teamId` column), like `Attendance`.
- **Decks are links (ADR-0002)** — cards are *references* into the global card DB, never a stored deck list.
- **No game specifics in shared/core** — the best-of default lives behind the `GameAdapter`; the web reads it via `/api/game-config`.
- **Confidence-weight model is unchanged** (ADR-0005).
- **Test-first, atomic commits**; every commit must pass the lefthook gate (`format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`). Do **not** use `--no-verify`.
- **Card validation:** any referenced `cardId` must belong to the team's game → else `422`.
- **Toolchain:** prefix commands with `export PATH="$HOME/.local/share/mise/shims:$PATH"` so the pinned node/pnpm resolve.

---

### Task 1: Shared — card-capture schemas

**Files:**
- Modify: `packages/shared/src/game-log.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)
- Test: `packages/shared/src/game-log.test.ts`

**Interfaces:**
- Produces: `gameLogCardRoleSchema` (`z.enum(["impressive","underperforming"])`), `gameLogCardSideSchema` (`z.enum(["ours","theirs"])`), `gameLogCardInputSchema` (`{ cardId: string; side: GameLogCardSide }`), and the types `GameLogCardRole`, `GameLogCardSide`, `GameLogCardInput`. `createGameLogSchema` and `updateGameLogSchema` gain optional `impressiveCards` / `underperformingCards` arrays of `gameLogCardInputSchema`. `gameLogDetailSchema` gains `impressiveCards` / `underperformingCards` arrays of `gameLogCardSchema` (`{ card: cardSummarySchema, side }`).

- [ ] **Step 1: Write the failing tests** — append to `packages/shared/src/game-log.test.ts`:

```ts
import {
  gameLogCardInputSchema,
  gameLogCardRoleSchema,
  gameLogCardSideSchema,
} from "./game-log.js";

describe("game-log card capture", () => {
  it("accepts a valid card reference with a side", () => {
    expect(gameLogCardInputSchema.parse({ cardId: "card_1", side: "ours" })).toEqual({
      cardId: "card_1",
      side: "ours",
    });
  });

  it("rejects an unknown side", () => {
    expect(() => gameLogCardInputSchema.parse({ cardId: "card_1", side: "mine" })).toThrow();
  });

  it("rejects a missing cardId", () => {
    expect(() => gameLogCardInputSchema.parse({ side: "ours" })).toThrow();
  });

  it("enumerates roles and sides", () => {
    expect(gameLogCardRoleSchema.options).toEqual(["impressive", "underperforming"]);
    expect(gameLogCardSideSchema.options).toEqual(["ours", "theirs"]);
  });

  it("accepts card arrays on create and defaults them to empty", () => {
    const parsed = createGameLogSchema.parse(validCreateInput());
    expect(parsed.impressiveCards).toEqual([]);
    expect(parsed.underperformingCards).toEqual([]);
  });

  it("accepts card arrays on create when provided", () => {
    const parsed = createGameLogSchema.parse(
      validCreateInput({ impressiveCards: [{ cardId: "c1", side: "ours" }] }),
    );
    expect(parsed.impressiveCards).toEqual([{ cardId: "c1", side: "ours" }]);
  });

  it("accepts a card-array-only update", () => {
    const parsed = updateGameLogSchema.parse({
      underperformingCards: [{ cardId: "c2", side: "theirs" }],
    });
    expect(parsed.underperformingCards).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/shared test -- game-log`
Expected: FAIL (`gameLogCardInputSchema` is not exported).

- [ ] **Step 3: Implement the schemas** — in `packages/shared/src/game-log.ts`, add after the `learningsSchema` block, and import `cardSummarySchema`:

```ts
import { cardSummarySchema } from "./cards.js";

/** Whether a card over- or under-performed in the game. */
export const gameLogCardRoleSchema = z.enum(["impressive", "underperforming"]);
export type GameLogCardRole = z.infer<typeof gameLogCardRoleSchema>;

/** Whose card it was: our side or the opponent's. */
export const gameLogCardSideSchema = z.enum(["ours", "theirs"]);
export type GameLogCardSide = z.infer<typeof gameLogCardSideSchema>;

/** A card reference captured on a game log, tagged by side. */
export const gameLogCardInputSchema = z.object({
  cardId: z.string().min(1),
  side: gameLogCardSideSchema,
});
export type GameLogCardInput = z.infer<typeof gameLogCardInputSchema>;

/** A captured card as returned by the API (the card summary + its side). */
export const gameLogCardSchema = z.object({
  card: cardSummarySchema,
  side: gameLogCardSideSchema,
});
export type GameLogCard = z.infer<typeof gameLogCardSchema>;
```

Then add to the `createGameLogSchema` object (before the closing `.refine`):

```ts
    impressiveCards: z.array(gameLogCardInputSchema).max(20).default([]),
    underperformingCards: z.array(gameLogCardInputSchema).max(20).default([]),
```

Add to the `updateGameLogSchema` object:

```ts
    impressiveCards: z.array(gameLogCardInputSchema).max(20).optional(),
    underperformingCards: z.array(gameLogCardInputSchema).max(20).optional(),
```

Add to `gameLogDetailSchema.extend({...})`:

```ts
    impressiveCards: z.array(gameLogCardSchema),
    underperformingCards: z.array(gameLogCardSchema),
```

- [ ] **Step 4: Export from the barrel** — add to the `./game-log.js` export block in `packages/shared/src/index.ts`:

```ts
  gameLogCardRoleSchema,
  gameLogCardSideSchema,
  gameLogCardInputSchema,
  gameLogCardSchema,
  type GameLogCardRole,
  type GameLogCardSide,
  type GameLogCardInput,
  type GameLogCard,
```

- [ ] **Step 5: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/shared test -- game-log && pnpm --filter @teambrewer/shared build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/game-log.ts packages/shared/src/game-log.test.ts packages/shared/src/index.ts
git commit -m "feat(game-logging): add shared card-capture schemas (impressive/underperforming)"
```

---

### Task 2: Shared — game-config schema

**Files:**
- Create: `packages/shared/src/game-config.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/game-config.test.ts`

**Interfaces:**
- Produces: `gameConfigSchema` (`{ gameId: string; identityLabel: string; defaultBestOf: BestOf }`) and type `GameConfig`. Reuses `bestOfSchema` from `./game-log.js`.

- [ ] **Step 1: Write the failing test** — `packages/shared/src/game-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { gameConfigSchema } from "./game-config.js";

describe("gameConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(
      gameConfigSchema.parse({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 }),
    ).toEqual({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
  });

  it("rejects a non-1/3/5 best-of", () => {
    expect(() =>
      gameConfigSchema.parse({ gameId: "x", identityLabel: "Hero", defaultBestOf: 2 }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/shared test -- game-config`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `packages/shared/src/game-config.ts`:

```ts
import { z } from "zod";

import { bestOfSchema } from "./game-log.js";

/**
 * Per-game UI configuration the web reads to adapt to the active team's game
 * (docs/architecture/game-abstraction.md). Resolved server-side from the verified
 * team's game via the GameAdapter — never client-supplied.
 */
export const gameConfigSchema = z.object({
  gameId: z.string(),
  identityLabel: z.string(),
  defaultBestOf: bestOfSchema,
});
export type GameConfig = z.infer<typeof gameConfigSchema>;
```

- [ ] **Step 4: Export from the barrel** — add to `packages/shared/src/index.ts`:

```ts
export { gameConfigSchema, type GameConfig } from "./game-config.js";
```

- [ ] **Step 5: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/shared test -- game-config && pnpm --filter @teambrewer/shared build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/game-config.ts packages/shared/src/game-config.test.ts packages/shared/src/index.ts
git commit -m "feat(game-config): add shared game-config schema"
```

---

### Task 3: Prisma — `GameLogCard` model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_game_log_cards/migration.sql` (generated)

**Interfaces:**
- Produces: the `GameLogCard` table + `GameLogCardRole` / `GameLogCardSide` PG enums; back-relations `cards GameLogCard[]` on `GameLog` and `gameLogCards GameLogCard[]` on `Card`.

- [ ] **Step 1: Add the enums + model** — in `apps/api/prisma/schema.prisma`, directly after the `GameLog` model, add:

```prisma
/// Whether a card over- or under-performed in a logged game.
enum GameLogCardRole {
  impressive
  underperforming
}

/// Whose card it was in the game.
enum GameLogCardSide {
  ours
  theirs
}

/// A card reference captured on a game log (impressive/underperforming, tagged by
/// side). Like Attendance, it carries no teamId — it is reached only through its
/// team-scoped parent GameLog. Cards come from the global card DB (decks are
/// links, ADR-0002); the referenced card must belong to the team's game.
model GameLogCard {
  id        String          @id @default(cuid())
  gameLogId String          @map("game_log_id")
  cardId    String          @map("card_id")
  role      GameLogCardRole
  side      GameLogCardSide
  createdAt DateTime        @default(now()) @map("created_at")

  gameLog GameLog @relation(fields: [gameLogId], references: [id], onDelete: Cascade)
  card    Card    @relation(fields: [cardId], references: [id], onDelete: Cascade)

  @@index([gameLogId])
  @@index([cardId])
  @@map("game_log_card")
}
```

- [ ] **Step 2: Add back-relations** — in the `GameLog` model relations block add:

```prisma
  cards GameLogCard[]
```

In the `Card` model relations block add:

```prisma
  gameLogCards GameLogCard[]
```

- [ ] **Step 3: Validate the schema**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && cd apps/api && pnpm exec prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 4: Author the migration against a throwaway Postgres** (ports 5432/5433 are taken by other projects — use 55432):

```bash
docker run -d --name tb-migrate-pg -e POSTGRES_USER=teambrewer -e POSTGRES_PASSWORD=teambrewer \
  -e POSTGRES_DB=teambrewer -p 55432:5432 postgres:17-alpine
until docker exec tb-migrate-pg pg_isready -U teambrewer >/dev/null 2>&1; do sleep 0.5; done
export PATH="$HOME/.local/share/mise/shims:$PATH"
DATABASE_URL="postgresql://teambrewer:teambrewer@localhost:55432/teambrewer" \
  pnpm --filter @teambrewer/api exec prisma migrate dev --name add_game_log_cards
pnpm --filter @teambrewer/api db:generate
docker rm -f tb-migrate-pg
```

Expected: a new `migrations/<timestamp>_add_game_log_cards/migration.sql` creating the two enums + `game_log_card` table; the Prisma client regenerates.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(game-logging): add GameLogCard model and migration"
```

---

### Task 4: API — `defaultBestOf` on the GameAdapter

**Files:**
- Modify: `apps/api/src/games/game-adapter.interface.ts`
- Modify: `apps/api/src/games/flesh-and-blood/flesh-and-blood.adapter.ts`
- Test: `apps/api/src/games/flesh-and-blood/flesh-and-blood.adapter.spec.ts` (create if absent; otherwise append)

**Interfaces:**
- Consumes: `BestOf` from `@teambrewer/shared`.
- Produces: `GameAdapter.defaultBestOf: BestOf`; `FleshAndBloodAdapter.defaultBestOf === 1`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/games/flesh-and-blood/flesh-and-blood.adapter.spec.ts`:

```ts
import { describe, expect, it } from "vitest";

import { FabCardSourceClient } from "./fab-card-source.client.js";
import { FleshAndBloodAdapter } from "./flesh-and-blood.adapter.js";

describe("FleshAndBloodAdapter defaultBestOf", () => {
  it("defaults Flesh and Blood games to a single game (Bo1)", () => {
    const adapter = new FleshAndBloodAdapter(new FabCardSourceClient());
    expect(adapter.defaultBestOf).toBe(1);
  });
});
```

(If the adapter constructor signature differs, match it — check the class header.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- flesh-and-blood.adapter`
Expected: FAIL (`defaultBestOf` is undefined).

- [ ] **Step 3: Implement** — in `game-adapter.interface.ts`, import the type and add to the `GameAdapter` interface (after `identityLabel`):

```ts
import type { BestOf } from "@teambrewer/shared";
// ...
  /** The best-of a new game log pre-selects for this game (FaB: 1, Riftbound: 3). */
  readonly defaultBestOf: BestOf;
```

In `flesh-and-blood.adapter.ts`, add to the class fields (after `identityLabel`):

```ts
  readonly defaultBestOf = 1 as const;
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- flesh-and-blood.adapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/games/game-adapter.interface.ts apps/api/src/games/flesh-and-blood
git commit -m "feat(game-config): add defaultBestOf to the GameAdapter (FaB = Bo1)"
```

---

### Task 5: API — `GameConfigModule` + `GET /api/game-config`

**Files:**
- Create: `apps/api/src/game-config/game-config.service.ts`
- Create: `apps/api/src/game-config/game-config.controller.ts`
- Create: `apps/api/src/game-config/game-config.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/game-config/game-config.integration.spec.ts`

**Interfaces:**
- Consumes: `GameAdapterRegistry.get(gameKey)` (from `GamesModule`, which exports it), `PrismaService`, `TeamContextGuard` + `@CurrentTeam()`.
- Produces: `GET /api/game-config` → `GameConfig` JSON.

- [ ] **Step 1: Write the failing integration test** — `apps/api/src/game-config/game-config.integration.spec.ts`:

```ts
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createGame,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

describe("Game-config endpoint (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let team: TestTeam;
  let member: TestUser;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });
  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();
    await createGame(prisma, { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" });
    team = await createTeam(prisma, { name: "Alpha", gameId: "flesh-and-blood" });
    member = await createUser(prisma, { username: "member_a" });
    await addMembership(prisma, { teamId: team.id, userId: member.id, role: "member" });
  });

  it("returns the team's game config with the adapter's defaultBestOf", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/game-config")
      .set("x-test-user-id", member.id)
      .set("x-team-id", team.id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: "flesh-and-blood",
      identityLabel: "Hero",
      defaultBestOf: 1,
    });
  });

  it("requires authentication (401)", async () => {
    const response = await request(app.getHttpServer()).get("/api/game-config").set("x-team-id", team.id);
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-config.integration`
Expected: FAIL (404 — route not found).

- [ ] **Step 3: Implement the service** — `apps/api/src/game-config/game-config.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { type GameConfig, errorCode } from "@teambrewer/shared";

import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Resolves per-game UI config for the verified team by looking up its game's key
 * and asking the GameAdapter. Read-only; the only non-sync consumer of the adapter
 * registry (a game-agnostic seam — see docs/architecture/game-abstraction.md).
 */
@Injectable()
export class GameConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GameAdapterRegistry,
  ) {}

  async getForTeam(team: TeamContext): Promise<GameConfig> {
    const game = await this.prisma.game.findFirst({
      where: { id: team.gameId },
      select: { id: true, key: true },
    });
    if (!game) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Game not found for this team." },
      });
    }
    const adapter = this.registry.get(game.key);
    return {
      gameId: game.id,
      identityLabel: adapter.identityLabel,
      defaultBestOf: adapter.defaultBestOf,
    };
  }
}
```

- [ ] **Step 4: Implement the controller** — `apps/api/src/game-config/game-config.controller.ts`:

```ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import type { GameConfig } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { GameConfigService } from "./game-config.service.js";

/** Per-game UI config for the active team (docs/architecture/game-abstraction.md). */
@Controller("game-config")
@UseGuards(TeamContextGuard)
export class GameConfigController {
  constructor(private readonly gameConfig: GameConfigService) {}

  @Get()
  get(@CurrentTeam() team: TeamContext): Promise<GameConfig> {
    return this.gameConfig.getForTeam(team);
  }
}
```

- [ ] **Step 5: Implement the module** — `apps/api/src/game-config/game-config.module.ts`:

```ts
import { Module } from "@nestjs/common";

import { GamesModule } from "../games/games.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { GameConfigController } from "./game-config.controller.js";
import { GameConfigService } from "./game-config.service.js";

/** Exposes per-game UI config resolved from the team's GameAdapter. */
@Module({
  imports: [TenancyModule, GamesModule],
  controllers: [GameConfigController],
  providers: [GameConfigService],
})
export class GameConfigModule {}
```

- [ ] **Step 6: Register in `app.module.ts`** — add the import and include `GameConfigModule` in the `imports` array (alongside `GameLogsModule`).

- [ ] **Step 7: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-config.integration`
Expected: PASS (both cases).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/game-config apps/api/src/app.module.ts
git commit -m "feat(game-config): add GET /api/game-config resolving the adapter default"
```

---

### Task 6: API — persist captured cards on create

**Files:**
- Modify: `apps/api/src/game-logs/game-logs.service.ts`
- Modify: `apps/api/src/game-logs/game-logs.integration.spec.ts`

**Interfaces:**
- Consumes: `createGameLogSchema` output (now with `impressiveCards` / `underperformingCards`).
- Produces: `GameLogDetail` responses now nest `impressiveCards` / `underperformingCards` (`{ card, side }`).

- [ ] **Step 1: Write the failing integration test** — add to `game-logs.integration.spec.ts` (uses the existing `createCard` factory; add a card in `beforeEach` or inline). Inline a card create via `prisma`:

```ts
  it("persists impressive/underperforming cards with role and side", async () => {
    const card = await prisma.card.create({
      data: { gameId: "flesh-and-blood", externalId: "c-boost", name: "Command and Conquer", pitch: 1 },
    });
    const response = await asMemberA(http().post("/api/game-logs")).send({
      ...validGame(),
      impressiveCards: [{ cardId: card.id, side: "ours" }],
      underperformingCards: [{ cardId: card.id, side: "theirs" }],
    });
    expect(response.status).toBe(201);
    expect(response.body.impressiveCards).toEqual([
      expect.objectContaining({ side: "ours", card: expect.objectContaining({ id: card.id }) }),
    ]);
    expect(response.body.underperformingCards).toEqual([
      expect.objectContaining({ side: "theirs", card: expect.objectContaining({ id: card.id }) }),
    ]);
  });

  it("rejects a captured card from another game (422)", async () => {
    const riftCard = await prisma.card.create({
      data: { gameId: "riftbound", externalId: "c-rift", name: "Rift Bolt", pitch: null },
    });
    const response = await asMemberA(http().post("/api/game-logs")).send({
      ...validGame(),
      impressiveCards: [{ cardId: riftCard.id, side: "ours" }],
    });
    expect(response.status).toBe(422);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-logs.integration`
Expected: FAIL (`impressiveCards` missing from response; second test returns 201 not 422).

- [ ] **Step 3: Implement** — in `game-logs.service.ts`:

  1. Extend the `GameLogRow` include/read to fetch cards. Change the private `findGameLog` query to include the join rows:

  ```ts
  const row = (await this.scoped.db.gameLog.findFirst({
    where: { id: gameLogId },
    include: {
      cards: { include: { card: true }, orderBy: { createdAt: "asc" } },
    },
  })) as GameLogRow | null;
  ```

  and add to the `GameLogRow` interface:

  ```ts
  cards?: {
    role: "impressive" | "underperforming";
    side: "ours" | "theirs";
    card: { id: string; name: string; pitch: number | null; imageUrl: string | null };
  }[];
  ```

  2. Add a private helper that validates + returns rows to create:

  ```ts
  /** Validate captured cards belong to the team's game and map to GameLogCard rows. */
  private async resolveCapturedCards(
    gameId: string,
    impressive: { cardId: string; side: "ours" | "theirs" }[],
    underperforming: { cardId: string; side: "ours" | "theirs" }[],
  ): Promise<{ cardId: string; role: "impressive" | "underperforming"; side: "ours" | "theirs" }[]> {
    const all = [
      ...impressive.map((c) => ({ ...c, role: "impressive" as const })),
      ...underperforming.map((c) => ({ ...c, role: "underperforming" as const })),
    ];
    for (const entry of all) {
      const card = await this.scoped.db.card.findFirst({
        where: { id: entry.cardId, gameId },
        select: { id: true },
      });
      if (!card) {
        throw new UnprocessableEntityException({
          error: { code: errorCode.domainRuleViolation, message: "A captured card does not belong to this team's game." },
        });
      }
    }
    return all;
  }
  ```

  Note: `card` is a **global** model, so query it via the un-scoped `this.scoped.db.card` (the scoping proxy passes global models through) filtered by `gameId` — matching `assertHeroInGame`.

  3. In `create()`, after `const sideB = ...` and before the `create` call, resolve cards and write them nested:

  ```ts
  const capturedCards = await this.resolveCapturedCards(
    team.gameId,
    input.impressiveCards,
    input.underperformingCards,
  );
  ```

  Then add to the `create({ data: {...} })` object:

  ```ts
        cards: { create: capturedCards },
  ```

  4. Update `toGameLogDetail` to map the nested cards:

  ```ts
  function toGameLogDetail(row: GameLogRow): GameLogDetail {
    const cards = row.cards ?? [];
    const toCard = (c: (typeof cards)[number]) => ({
      side: c.side,
      card: { id: c.card.id, name: c.card.name, pitch: c.card.pitch, imageUrl: c.card.imageUrl },
    });
    return {
      ...toGameLogSummary(row),
      learnings: row.learnings,
      confidenceFactors: { /* unchanged */ },
      impressiveCards: cards.filter((c) => c.role === "impressive").map(toCard),
      underperformingCards: cards.filter((c) => c.role === "underperforming").map(toCard),
    };
  }
  ```

  (Confirm `cardSummarySchema` fields — `{ id, name, pitch, imageUrl }` — match the map; adjust if the summary carries more.)

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-logs.integration`
Expected: PASS (both new tests + the existing suite).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/game-logs/game-logs.service.ts apps/api/src/game-logs/game-logs.integration.spec.ts
git commit -m "feat(game-logging): capture impressive/underperforming cards on create"
```

---

### Task 7: API — replace captured cards on update

**Files:**
- Modify: `apps/api/src/game-logs/game-logs.service.ts`
- Modify: `apps/api/src/game-logs/game-logs.integration.spec.ts`

**Interfaces:**
- Consumes: `updateGameLogSchema` output (optional card arrays).
- Produces: on update, a provided card array **replaces** that role's set; an omitted array leaves it unchanged.

- [ ] **Step 1: Write the failing integration tests** — add:

```ts
  it("replaces the impressive-card set on update", async () => {
    const card1 = await prisma.card.create({ data: { gameId: "flesh-and-blood", externalId: "c1", name: "Card One", pitch: 1 } });
    const card2 = await prisma.card.create({ data: { gameId: "flesh-and-blood", externalId: "c2", name: "Card Two", pitch: 2 } });
    const created = await asMemberA(http().post("/api/game-logs")).send({
      ...validGame(),
      impressiveCards: [{ cardId: card1.id, side: "ours" }],
    });
    const updated = await asMemberA(http().patch(`/api/game-logs/${created.body.id}`)).send({
      impressiveCards: [{ cardId: card2.id, side: "theirs" }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.impressiveCards).toEqual([
      expect.objectContaining({ side: "theirs", card: expect.objectContaining({ id: card2.id }) }),
    ]);
  });

  it("does not touch captured cards a team cannot see (tenant isolation)", async () => {
    const card = await prisma.card.create({ data: { gameId: "flesh-and-blood", externalId: "c3", name: "Card Three", pitch: 1 } });
    const created = await asMemberA(http().post("/api/game-logs")).send({
      ...validGame(),
      impressiveCards: [{ cardId: card.id, side: "ours" }],
    });
    // memberB (team B) cannot read or edit team A's log or its cards.
    const read = await asMemberB(http().get(`/api/game-logs/${created.body.id}`));
    expect(read.status).toBe(404);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-logs.integration`
Expected: FAIL (update ignores `impressiveCards`).

- [ ] **Step 3: Implement** — in `update()`, after the existing field handling and before/after the `updateMany`, add per-role replacement (only when the array is provided):

```ts
    if (input.impressiveCards !== undefined || input.underperformingCards !== undefined) {
      const gameId = team.gameId;
      if (input.impressiveCards !== undefined) {
        await this.replaceCapturedCards(gameLogId, gameId, "impressive", input.impressiveCards);
      }
      if (input.underperformingCards !== undefined) {
        await this.replaceCapturedCards(gameLogId, gameId, "underperforming", input.underperformingCards);
      }
    }
```

Add the helper:

```ts
  /** Replace the captured cards for one role on a log (validated against the game). */
  private async replaceCapturedCards(
    gameLogId: string,
    gameId: string,
    role: "impressive" | "underperforming",
    cards: { cardId: string; side: "ours" | "theirs" }[],
  ): Promise<void> {
    for (const entry of cards) {
      const card = await this.scoped.db.card.findFirst({ where: { id: entry.cardId, gameId }, select: { id: true } });
      if (!card) {
        throw new UnprocessableEntityException({
          error: { code: errorCode.domainRuleViolation, message: "A captured card does not belong to this team's game." },
        });
      }
    }
    // gameLogCard is reached only through its team-scoped parent; scope by the
    // parent id (already confirmed visible by loadModifiableGameLog above).
    await this.scoped.db.gameLogCard.deleteMany({ where: { gameLogId, role } });
    if (cards.length > 0) {
      await this.scoped.db.gameLogCard.createMany({
        data: cards.map((c) => ({ gameLogId, cardId: c.cardId, role, side: c.side })),
      });
    }
  }
```

Note: `gameLogCard` is **not** in `TEAM_OWNED_MODELS`, so `this.scoped.db.gameLogCard` is the raw delegate — scope by `gameLogId` (the parent was already authorized in `loadModifiableGameLog`). Confirm `update()` still returns the fresh detail (which now includes cards) via `requireGameLogDetail`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- game-logs.integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/game-logs/game-logs.service.ts apps/api/src/game-logs/game-logs.integration.spec.ts
git commit -m "feat(game-logging): replace captured cards on update"
```

---

### Task 8: Web — game-config hook

**Files:**
- Modify: `apps/web/src/lib/query-keys.ts`
- Create: `apps/web/src/features/game-logging/use-game-config.ts`

**Interfaces:**
- Produces: `useGameConfig(teamId)` → TanStack query of `GameConfig`; query key `queryKeys.gameConfig(teamId)`.

- [ ] **Step 1: Add the query key** — in `query-keys.ts`, add near the games keys:

```ts
  gameConfig: (teamId: string) => [teamId, "game-config"] as const,
```

- [ ] **Step 2: Implement the hook** — `apps/web/src/features/game-logging/use-game-config.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { type GameConfig, gameConfigSchema } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's per-game UI config (GET /api/game-config). */
export function useGameConfig(teamId: string | undefined) {
  return useQuery<GameConfig>({
    queryKey: teamId ? queryKeys.gameConfig(teamId) : ["game-config", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/game-config", { teamId, schema: gameConfigSchema });
    },
    enabled: Boolean(teamId),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/query-keys.ts apps/web/src/features/game-logging/use-game-config.ts
git commit -m "feat(game-config): add web useGameConfig hook"
```

---

### Task 9: Web — card labels + display helpers

**Files:**
- Modify: `apps/web/src/features/game-logging/game-display.ts`

**Interfaces:**
- Produces: `GAME_LOG_CARD_SIDE_LABELS: Record<GameLogCardSide, string>` (`{ ours: "Our card", theirs: "Their card" }`).

- [ ] **Step 1: Add the labels** — append to `game-display.ts`:

```ts
import type { GameLogCardSide } from "@teambrewer/shared";

/** Human labels for whose card a captured card was. */
export const GAME_LOG_CARD_SIDE_LABELS: Record<GameLogCardSide, string> = {
  ours: "Our card",
  theirs: "Their card",
};
```

- [ ] **Step 2: Typecheck**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/game-logging/game-display.ts
git commit -m "feat(game-logging): add captured-card side labels"
```

---

### Task 10: Web — the wizard (container + steps), replacing `GameLogForm`

**Files:**
- Create: `apps/web/src/features/game-logging/GameLogWizard.tsx`
- Create: `apps/web/src/features/game-logging/wizard/WizardProgress.tsx`
- Create: `apps/web/src/features/game-logging/wizard/StepMatchup.tsx`
- Create: `apps/web/src/features/game-logging/wizard/StepResult.tsx`
- Create: `apps/web/src/features/game-logging/wizard/StepConfidence.tsx`
- Create: `apps/web/src/features/game-logging/wizard/StepNotes.tsx`
- Create: `apps/web/src/features/game-logging/wizard/CardCaptureList.tsx`
- Delete: `apps/web/src/features/game-logging/GameLogForm.tsx`
- Rename test: `apps/web/src/features/game-logging/GameLogWizard.test.tsx` (replaces `GameLogForm.test.tsx`)

**Interfaces:**
- Consumes: `useGameConfig`, `useCreateGame`/`useUpdateGame`, `useDecks`, `useMembers`, `useEvents`, `HeroPicker`, `FormatPicker`, `CardPicker`, `deriveConfidenceWeight`, `isGameResultConsistent`, the display helpers.
- Produces: `GameLogWizard({ teamId, gameLog?, onSaved, onCancel })` — the drop-in replacement for `GameLogForm`.

This task lifts the existing `GameLogForm.tsx` field logic (already written in phase-06) into a shared-state container plus step components. The container holds every piece of state the current form holds (see `GameLogForm.tsx` for the exact `useState` set and the `buildSideB`/`submit`/`payload` logic — reuse them verbatim), adds `step` state (`1 | 2 | 3`) and a `showNotes` flag, and threads state + setters into the steps. The card arrays (`impressiveCards`, `underperformingCards` as `GameLogCardInput[]`) are new state added to the `payload`.

- [ ] **Step 1: Write the failing wizard test** — create `GameLogWizard.test.tsx` by copying `GameLogForm.test.tsx`'s `mockApi` harness (it already mocks `/api/me`, `/api/formats`, `/api/heroes`, `/api/members`, `/api/events`, `/api/decks`, `POST /api/game-logs`) and add a `GET /api/game-config` branch returning `{ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 }`. Then the tests:

```ts
import { GameLogWizard } from "./GameLogWizard";

// ...inside describe("GameLogWizard"):

it("pre-selects the game's default best-of (Bo1 for FaB)", async () => {
  mockApi();
  renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
  // Step 1 → Next → Step 2 shows the result control; Single game is active.
  await screen.findByRole("option", { name: "Classic Constructed" });
  await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
  await screen.findByRole("option", { name: "Our Deck" });
  await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
  await screen.findByRole("option", { name: "Dorinthea" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Hero", exact: true }), "hero-dori");
  await user.click(screen.getByRole("button", { name: /next/i }));
  expect(await screen.findByRole("button", { name: /single game/i })).toHaveAttribute("aria-pressed", "true");
});

it("logs a game through the 3-step fast path", async () => {
  const created: unknown[] = [];
  mockApi({ onCreate: (b) => created.push(b) });
  const onSaved = vi.fn();
  renderWithClient(<GameLogWizard teamId="team-1" onSaved={onSaved} />);
  // step 1
  await screen.findByRole("option", { name: "Classic Constructed" });
  await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
  await screen.findByRole("option", { name: "Our Deck" });
  await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
  await screen.findByRole("option", { name: "Dorinthea" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Hero", exact: true }), "hero-dori");
  await user.click(screen.getByRole("button", { name: /next/i }));
  // step 2 → Next
  await user.click(screen.getByRole("button", { name: /next/i }));
  // step 3 → Log game
  expect(screen.getByText(/counts as ~1\.00/i)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /^log game$/i }));
  await vi.waitFor(() => expect(created).toHaveLength(1));
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("blocks Next on step 1 until deck and opponent are chosen", async () => {
  mockApi();
  renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
  await user.click(screen.getByRole("button", { name: /next/i }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
```

(Declare `const user = userEvent.setup();` per-test as in the existing file.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test -- GameLogWizard`
Expected: FAIL (`GameLogWizard` not found).

- [ ] **Step 3: Build `WizardProgress.tsx`**

```tsx
/** The "Step N of 3" indicator with Back/Next controls for the logging wizard. */
export function WizardProgress({
  step,
  onBack,
  onNext,
  nextLabel = "Next",
}: {
  step: number;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Step {step} of 3
      </span>
      <div className="flex gap-2">
        {onBack ? (
          <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={onBack}>
            Back
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

(The primary Next/Log button lives in the step footer, not here — this is a lightweight header. `onNext`/`nextLabel` are passed for a header Next only if desired; keep the footer button as the action.)

- [ ] **Step 4: Build `CardCaptureList.tsx`** (the genuinely new UI — a titled list that adds cards via `CardPicker` and tags each ours/theirs):

```tsx
import { type CardSummary, type GameLogCardInput, type GameLogCardSide } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { CardPicker } from "@/features/cards/CardPicker";

import { GAME_LOG_CARD_SIDE_LABELS } from "../game-display";

/** Names + tags a set of captured cards for one role (impressive/underperforming). */
export function CardCaptureList({
  teamId,
  label,
  value,
  onChange,
  nameOf,
}: {
  teamId: string | undefined;
  label: string;
  value: GameLogCardInput[];
  onChange: (next: GameLogCardInput[]) => void;
  nameOf: (cardId: string) => string;
}) {
  function add(card: CardSummary) {
    if (value.some((entry) => entry.cardId === card.id)) return;
    onChange([...value, { cardId: card.id, side: "ours" }]);
  }
  function setSide(cardId: string, side: GameLogCardSide) {
    onChange(value.map((entry) => (entry.cardId === cardId ? { ...entry, side } : entry)));
  }
  function remove(cardId: string) {
    onChange(value.filter((entry) => entry.cardId !== cardId));
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      <CardPicker teamId={teamId} onSelect={add} placeholder="Search a card…" />
      <ul className="flex flex-col gap-1">
        {value.map((entry) => (
          <li key={entry.cardId} className="flex items-center justify-between gap-2 text-sm">
            <span>{nameOf(entry.cardId)}</span>
            <span className="flex items-center gap-1">
              {(["ours", "theirs"] as GameLogCardSide[]).map((side) => (
                <Button
                  key={side}
                  type="button"
                  size="sm"
                  variant={entry.side === side ? "default" : "outline"}
                  aria-pressed={entry.side === side}
                  onClick={() => setSide(entry.cardId, side)}
                >
                  {GAME_LOG_CARD_SIDE_LABELS[side]}
                </Button>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(entry.cardId)}>
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
```

Note: `CardPicker`'s `onSelect` gives a `CardSummary`; keep a local `Map<cardId, name>` in the container (populated from each `onSelect`) so `nameOf` can render the name without a re-fetch. Pass `nameOf={(id) => cardNames.get(id) ?? "Card"}`.

- [ ] **Step 5: Build the step components** — each receives the relevant slice of state + setters from the container. Move the corresponding JSX out of the old `GameLogForm.tsx`:
  - `StepMatchup.tsx` — the Format `FormatPicker`, the "Your deck" `<select>`, and the opponent kind switcher + conditional hero/teammate/archetype/reference controls (verbatim from the current form's step-1 fields). Exposes an `isValid` derived by the container.
  - `StepResult.tsx` — the "Who went first?" segmented control, the "Best of" segmented control, and the Win/Loss/Draw buttons (Bo1) or games-won steppers (match). Reuse the current `SegmentedControl`, `setSingleGameOutcome`, `changeBestOf` logic — move `SegmentedControl` into `wizard/SegmentedControl.tsx` and import it in both steps.
  - `StepConfidence.tsx` — the four factor `SegmentedControl`s + the live "Counts as ~X.XX" + the primary **Log game** button + a "Add notes & cards" toggle that reveals step 4 inline (or advances to it).
  - `StepNotes.tsx` — two `CardCaptureList`s (Impressive / Underperforming) + the existing "More details" fields (pilot, opponent name, event, win type, loss reason, learnings) moved from the old form, + a **Save** button.

  The container renders exactly one step at a time based on `step`, with `WizardProgress` on top. `submit()` builds the same `payload` as the current form and additionally includes `impressiveCards`/`underperformingCards`; it is invoked by both the step-3 "Log game" and the step-4 "Save".

- [ ] **Step 6: Delete `GameLogForm.tsx` and its test**, and update imports (`GamesPage.tsx`, `GameDetail.tsx`) — handled in Task 11.

- [ ] **Step 7: Run to verify pass**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test -- GameLogWizard`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/game-logging
git commit -m "feat(game-logging): replace the log form with a 3-step wizard + card capture"
```

---

### Task 11: Web — wire pages to the wizard + show captured cards on the hub

**Files:**
- Modify: `apps/web/src/features/game-logging/GamesPage.tsx`
- Modify: `apps/web/src/features/game-logging/GameDetail.tsx`

**Interfaces:**
- Consumes: `GameLogWizard` (replaces `GameLogForm`), the detail's `impressiveCards`/`underperformingCards`.

- [ ] **Step 1: Swap the component** — in `GamesPage.tsx` and `GameDetail.tsx`, replace `<GameLogForm .../>` with `<GameLogWizard .../>` (same props) and update the import.

- [ ] **Step 2: Render captured cards on the hub** — in `GameDetail.tsx`, after the Learnings section, add (only when non-empty):

```tsx
{game.impressiveCards.length > 0 ? (
  <section className="flex flex-col gap-1">
    <h3 className="text-sm font-semibold">Impressive cards</h3>
    <ul className="flex flex-col gap-1 text-sm">
      {game.impressiveCards.map((entry) => (
        <li key={entry.card.id} className="flex justify-between gap-2">
          <span>{entry.card.name}</span>
          <span className="text-muted-foreground">{GAME_LOG_CARD_SIDE_LABELS[entry.side]}</span>
        </li>
      ))}
    </ul>
  </section>
) : null}
```

and the analogous "Underperforming cards" section for `game.underperformingCards`. Import `GAME_LOG_CARD_SIDE_LABELS` from `./game-display`.

- [ ] **Step 3: Run web tests + typecheck**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test && pnpm --filter @teambrewer/web typecheck`
Expected: PASS + clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/game-logging/GamesPage.tsx apps/web/src/features/game-logging/GameDetail.tsx
git commit -m "feat(game-logging): use the wizard on the games pages and show captured cards"
```

---

### Task 12: e2e — phone wizard journey

**Files:**
- Modify: `apps/web/e2e/game-logging.spec.ts`

**Interfaces:**
- Consumes: the seeded game-logging user + deck + hero from `global-setup.ts` (unchanged); a card seed is added for the card step.

- [ ] **Step 1: Seed a card** — in `apps/web/e2e/global-setup.ts`, extend `seedGameLogDeck` (or add a `seedGameLogCard`) to insert a FaB card the spec can pick:

```ts
await client.query(
  `INSERT INTO "card" (id, game_id, external_id, name, pitch, updated_at)
   VALUES ($1,'flesh-and-blood','e2e-cnc','Command and Conquer',1,$2)`,
  [randomUUID(), new Date().toISOString()],
);
```

(Confirm the `card` table's required columns via `schema.prisma`; add `image_url` NULL if required.)

- [ ] **Step 2: Rewrite the spec for the wizard** — replace the single-screen steps with the wizard flow (Next between steps), then a second pass that opens step 4 and adds a card:

```ts
// Step 1 — Matchup
await page.locator("#game-format").selectOption({ label: E2E_REFERENCE.formatName });
await page.locator("#game-deck").selectOption({ label: deckName });
await page.getByRole("combobox", { name: "Hero", exact: true }).selectOption({ label: E2E_REFERENCE.heroName });
await page.getByRole("button", { name: /next/i }).click();
// Step 2 — Result (defaults are fine)
await page.getByRole("button", { name: /next/i }).click();
// Step 3 — Confidence → add notes & cards
await page.getByRole("button", { name: /add notes & cards/i }).click();
// Step 4 — capture an impressive card
await page.getByRole("combobox", { name: /search a card/i }).fill("Command");
await page.getByRole("option", { name: /Command and Conquer/i }).click();
await page.getByRole("button", { name: /^save$/i }).press("Enter");
// Hub shows the weight and the captured card
await expect(page.getByText("~1.00").first()).toBeVisible();
await expect(page.getByText("Command and Conquer")).toBeVisible();
```

Keep the existing tenant-isolation tail (switch to bravo → the game is not visible). Use `.press("Enter")` for the final submit (mobile pointer-interception workaround established in phase-06). Adjust selectors to the actual CardPicker markup (it renders a `role="combobox"` search input + `role="option"` results).

- [ ] **Step 3: Run the mobile e2e**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web exec playwright test --project=mobile`
Expected: PASS.

- [ ] **Step 4: Run the full e2e suite**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test:e2e`
Expected: all specs PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e
git commit -m "test(game-logging): drive the wizard + card capture in the phone e2e"
```

---

### Task 13: Docs, full verification, and integrate

**Files:**
- Modify: `docs/features/game-logging.md`, `docs/architecture/data-model.md`, `docs/architecture/game-abstraction.md`, `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-12-game-logging-wizard-and-card-capture-design.md` (flip status to Implemented)

- [ ] **Step 1: Update the docs** — in `game-logging.md` describe the wizard UX + the impressive/underperforming card capture; in `data-model.md` add `GameLogCard { id, gameLogId, cardId, role, side }` under Game logging; in `game-abstraction.md` add `defaultBestOf` to the adapter contract table + note the `/api/game-config` seam; in `CLAUDE.md` add a short "game-logging v2" note to the phase-06 narrative. Flip the spec's Status to `Implemented (2026-07-12)`.

- [ ] **Step 2: Full local verification**

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
pnpm test
pnpm test:e2e
pnpm lint && pnpm typecheck && pnpm build
```

Expected: all green. Capture the summary lines as evidence.

- [ ] **Step 3: Commit the docs**

```bash
git add docs CLAUDE.md
git commit -m "docs(game-logging): document the wizard, game-config seam, and card capture"
```

- [ ] **Step 4: Integrate** — fast-forward merge to `main` and delete the branch:

```bash
git switch main && git merge --ff-only feat/game-logging-wizard
git branch -d feat/game-logging-wizard
```

If the fast-forward is refused, `git switch feat/game-logging-wizard && git rebase main`, then retry. Do **not** push or create a remote.

## Self-Review notes

- **Spec coverage:** wizard (Tasks 10–11), game-driven best-of (Tasks 2, 4, 5, 8, 10), card capture (Tasks 1, 3, 6, 7, 10, 11), docs (Task 13), tests at every layer (Tasks 1–12). Covered.
- **Card-summary field check:** Task 6's `toGameLogDetail` maps `{ id, name, pitch, imageUrl }` — verify against `cardSummarySchema` in `packages/shared/src/cards.ts` before implementing and adjust the map if it carries more fields.
- **Scoping check:** `GameLogCard` deliberately omits `teamId` and is queried via the raw delegate scoped by `gameLogId`; Task 7's isolation test guards that decision.
