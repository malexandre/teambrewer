# Additive Discord Login for Password Accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a password + TOTP account that links Discord also sign in with Discord (either method resolves to the same user).

**Architecture:** Better Auth models login methods as rows in the `account` table keyed to one `user`. Today `linkIdentityOnly` sets only the user's `discordUserId`/`discordUsername` and never creates the `discord` account row, so Better Auth's social callback can't resolve the login. We make linking (and unlinking) manage that `account` row; login itself is unchanged Better Auth behaviour. A one-time data migration drops pre-existing identity-only links so those users re-link once with explicit consent.

**Tech Stack:** NestJS + Prisma (Postgres), Better Auth, React + Vite, Vitest (+ Testcontainers Postgres for integration), Testing Library.

## Global Constraints

- Toolchain via mise: Node 26.5.0, pnpm 11.11.0. Prefix commands with `export PATH="$HOME/.local/share/mise/shims:$PATH"` if pnpm/node engine-fail.
- Explicit, non-abbreviated names reflecting the domain (`discordUserId`, not `id`).
- TypeScript strict; no `any`.
- **Invite-only is preserved:** do **not** change `disableImplicitSignUp: true` on the Discord provider. Only the authenticated user's own account row is created.
- **Only the `identify` Discord scope** (no email) — unchanged.
- **Accepted tradeoff:** the Discord login path is not TOTP-protected; surface a "turn on Discord 2FA" recommendation in Settings. Do not add a step-up TOTP.
- Conventional Commits (`type(scope): summary`). Every commit must pass the lefthook pre-commit gate (format, `pnpm lint`, `pnpm typecheck`, `pnpm build`) and commitlint. Do not use `--no-verify`.
- Local-first: commit on `main`; **do not push** unless the user asks.
- Source of truth for "can log in with Discord" is the `account` row (`providerId="discord"`, `accountId=<discordUserId>`), never `authMethod`.

## File Structure

- `apps/api/src/auth/discord-account.service.ts` — MODIFY. `linkIdentityOnly` also upserts the `discord` account row; `unlinkIdentity` also deletes it (in a transaction); remove the now-misleading `resolveLoginUser`.
- `apps/api/src/auth/discord-account.service.integration.spec.ts` — MODIFY. Assert login capability via the `account` row (not `resolveLoginUser`); cover link-enables-login, relink, and unlink-revokes.
- `apps/api/prisma/migrations/<generated>_drop_identity_only_discord_links/migration.sql` — CREATE. Data-only migration clearing identity-only links.
- `apps/api/src/auth/discord-link-migration.integration.spec.ts` — CREATE. Prove the drop SQL targets only identity-only links.
- `apps/web/src/features/account/SettingsPage.tsx` — MODIFY. Export `DiscordIdentityCard`; new copy; 2FA recommendation when linked.
- `apps/web/src/features/account/DiscordIdentityCard.test.tsx` — CREATE. Render the card; assert new copy + recommendation.
- Docs — MODIFY/CREATE: `docs/decisions/0011-discord-additional-login-method.md` (new), `docs/decisions/0009-discord-authentication.md` (status), and the exclusivity lines in `docs/features/accounts-and-auth.md`, `docs/architecture/data-model.md`, `docs/architecture/security.md`, `docs/README.md`, `CLAUDE.md`.

---

### Task 1: Linking creates the Discord login account row (account row is the tested source of truth)

**Files:**
- Modify: `apps/api/src/auth/discord-account.service.ts` (`linkIdentityOnly`; remove `resolveLoginUser` at lines 148-170 and its doc bullet)
- Test: `apps/api/src/auth/discord-account.service.integration.spec.ts`

**Interfaces:**
- Consumes: `DiscordAccountService.linkIdentityOnly({ userId, discordUserId, discordUsername })`, existing `DISCORD_PROVIDER_ID = "discord"` and `randomUUID` already imported in the service.
- Produces: after `linkIdentityOnly`, an `account` row exists with `{ userId, providerId: "discord", accountId: discordUserId }`; `resolveLoginUser` no longer exists.

- [ ] **Step 1: Add a test helper and rewrite the link test to expect login enabled (failing)**

In `discord-account.service.integration.spec.ts`, add a helper next to `issueClaimToken` (inside the `describe` so it closes over `prisma`):

```typescript
async function discordLoginAccountId(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "discord" },
    select: { accountId: true },
  });
  return account?.accountId ?? null;
}
```

Replace the existing test `"links an identity without granting Discord login"` (lines 140-157) with:

```typescript
it("links a Discord identity and enables Discord login", async () => {
  const passwordUser = await createUser(prisma, { authMethod: "password_totp" });

  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2001",
    discordUsername: "Identity",
  });

  const stored = await prisma.user.findUnique({
    where: { id: passwordUser.id },
    select: { discordUserId: true, discordUsername: true },
  });
  expect(stored).toEqual({ discordUserId: "discord-2001", discordUsername: "Identity" });
  // Linking now creates the Better Auth login account row (one user, two accounts).
  expect(await discordLoginAccountId(passwordUser.id)).toBe("discord-2001");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration -t "enables Discord login"`
Expected: FAIL — `discordLoginAccountId` returns `null` (no account row created yet).

- [ ] **Step 3: Implement the account-row upsert in `linkIdentityOnly`**

In `discord-account.service.ts`, inside `linkIdentityOnly`'s transaction, after the existing `transaction.user.update({ ... discordUserId, discordUsername })` call, append:

```typescript
      // Discord login is modelled by the account row Better Auth resolves on
      // social sign-in (ADR-0011). Create it (or re-point it) so linking grants
      // login in addition to the account's password + TOTP.
      const existingLink = await transaction.account.findFirst({
        where: { userId: input.userId, providerId: DISCORD_PROVIDER_ID },
        select: { id: true, accountId: true },
      });
      if (!existingLink) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            providerId: DISCORD_PROVIDER_ID,
            accountId: input.discordUserId,
          },
        });
      } else if (existingLink.accountId !== input.discordUserId) {
        await transaction.account.update({
          where: { id: existingLink.id },
          data: { accountId: input.discordUserId },
        });
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration -t "enables Discord login"`
Expected: PASS.

- [ ] **Step 5: Add relink idempotency + re-point tests**

Add, in the `"identity link/unlink for password accounts"` describe block:

```typescript
it("is idempotent when re-linking the same Discord id (one account row)", async () => {
  const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2010",
    discordUsername: "Same",
  });
  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2010",
    discordUsername: "Same",
  });

  const rows = await prisma.account.count({
    where: { userId: passwordUser.id, providerId: "discord" },
  });
  expect(rows).toBe(1);
});

it("re-points the account row when re-linking a different Discord id", async () => {
  const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2011",
    discordUsername: "First",
  });
  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2012",
    discordUsername: "Second",
  });

  expect(await discordLoginAccountId(passwordUser.id)).toBe("discord-2012");
  const rows = await prisma.account.count({
    where: { userId: passwordUser.id, providerId: "discord" },
  });
  expect(rows).toBe(1);
});
```

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration -t "re-link"`
Expected: PASS (the Step 3 implementation already handles both).

- [ ] **Step 6: Remove `resolveLoginUser` and update its callers in tests**

In `discord-account.service.ts`, delete the entire `resolveLoginUser` method (lines 148-170) and its bullet in the class doc comment (the `- **Invite-only** (\`resolveLoginUser\`): ...` paragraph). Invite-only is enforced by Better Auth's `disableImplicitSignUp`, not this dead helper.

In `discord-account.service.integration.spec.ts`:
- In `"binds a Discord identity to a provisioned account and enables Discord login"`, replace the two lines using `resolveLoginUser` (lines 57-59) with:
  ```typescript
  // A login account link now exists, so a returning Discord login resolves.
  expect(await discordLoginAccountId(user.id)).toBe("discord-1001");
  ```
- In `"claims an unclaimed account via the unified setup invite..."`, replace `expect((await service.resolveLoginUser("discord-1500"))?.id).toBe(user.id);` (line 107) with:
  ```typescript
  expect(await discordLoginAccountId(user.id)).toBe("discord-1500");
  ```
- Delete the whole `describe("resolveLoginUser", ...)` block (lines 133-137).

- [ ] **Step 7: Run the full service spec**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration`
Expected: PASS (all tests in the file green; no reference to `resolveLoginUser` remains).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/discord-account.service.ts apps/api/src/auth/discord-account.service.integration.spec.ts
git commit -m "feat(auth): linking Discord grants login on password accounts

linkIdentityOnly now upserts the Better Auth discord account row, so a
password+TOTP account that links Discord can also sign in with Discord (one
user, two account rows). Remove the dead, now-misleading resolveLoginUser
helper; tests assert the account row directly.

Part of ADR-0011.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Unlinking revokes Discord login (deletes the account row)

**Files:**
- Modify: `apps/api/src/auth/discord-account.service.ts` (`unlinkIdentity`, currently lines 219-241)
- Test: `apps/api/src/auth/discord-account.service.integration.spec.ts`

**Interfaces:**
- Consumes: `DiscordAccountService.unlinkIdentity(userId)`.
- Produces: after `unlinkIdentity`, no `account` row with `providerId="discord"` for that user, and the user's `discordUserId`/`discordUsername` are `null`.

- [ ] **Step 1: Update the unlink test to assert the account row is gone (failing)**

Replace the existing `"unlinks a password account's identity"` test (lines 189-204) with:

```typescript
it("unlinks a password account's identity and revokes Discord login", async () => {
  const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
  await service.linkIdentityOnly({
    userId: passwordUser.id,
    discordUserId: "discord-2004",
    discordUsername: "Temp",
  });

  await service.unlinkIdentity(passwordUser.id);

  const stored = await prisma.user.findUnique({
    where: { id: passwordUser.id },
    select: { discordUserId: true, discordUsername: true },
  });
  expect(stored).toEqual({ discordUserId: null, discordUsername: null });
  expect(await discordLoginAccountId(passwordUser.id)).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration -t "revokes Discord login"`
Expected: FAIL — `discordLoginAccountId` still returns `"discord-2004"` (row not deleted).

- [ ] **Step 3: Implement the deletion inside a transaction**

Replace the body of `unlinkIdentity` with (guards unchanged, now transactional so the delete + update are atomic):

```typescript
  async unlinkIdentity(userId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, authMethod: true },
      });
      if (!user) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Account not found." },
        });
      }
      if (user.authMethod !== "password_totp") {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.loginMethodMismatch,
            message: "This account uses Discord to log in; its identity cannot be unlinked here.",
          },
        });
      }
      // Remove the Discord login account row (revokes Discord sign-in). The
      // password credential remains, so the account keeps a login method.
      await transaction.account.deleteMany({
        where: { userId, providerId: DISCORD_PROVIDER_ID },
      });
      await transaction.user.update({
        where: { id: userId },
        data: { discordUserId: null, discordUsername: null },
      });
    });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-account.service.integration -t "revokes Discord login"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/discord-account.service.ts apps/api/src/auth/discord-account.service.integration.spec.ts
git commit -m "feat(auth): unlinking Discord revokes login for password accounts

unlinkIdentity now deletes the discord account row in the same transaction as
clearing the user's Discord fields, so Discord sign-in is revoked. Password +
TOTP remains, so the account never loses its last login method.

Part of ADR-0011.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Settings UI — copy + Discord 2FA recommendation

**Files:**
- Modify: `apps/web/src/features/account/SettingsPage.tsx` (`DiscordIdentityCard`, lines 127-165)
- Test: `apps/web/src/features/account/DiscordIdentityCard.test.tsx` (create)

**Interfaces:**
- Consumes: `useCurrentUser()` → `{ authMethod, discordUsername }`; `apiClient.post/delete("/me/discord/link")`.
- Produces: exported `DiscordIdentityCard` component.

- [ ] **Step 1: Write the failing card test**

Create `apps/web/src/features/account/DiscordIdentityCard.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscordIdentityCard } from "./SettingsPage";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockMe(user: Record<string, unknown>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me")) return json(user);
    return json({}, 404);
  });
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscordIdentityCard />
    </QueryClientProvider>,
  );
}

const baseUser = {
  userId: "user-1",
  username: "alice",
  displayName: "Alice",
  authMethod: "password_totp",
  isInstanceAdmin: false,
};

describe("DiscordIdentityCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tells an unlinked password account that linking also enables sign-in", async () => {
    mockMe({ ...baseUser, discordUsername: null });
    renderCard();
    await waitFor(() =>
      expect(screen.getByText(/also sign in with Discord/i)).toBeInTheDocument(),
    );
  });

  it("shows the Discord 2FA recommendation once linked", async () => {
    mockMe({ ...baseUser, discordUsername: "alice#1" });
    renderCard();
    await waitFor(() => expect(screen.getByText(/Linked as alice#1/)).toBeInTheDocument());
    expect(screen.getByText(/enable two-factor.*Discord/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test -- DiscordIdentityCard`
Expected: FAIL — `DiscordIdentityCard` is not exported / new copy not present.

- [ ] **Step 3: Export the card and update its copy + recommendation**

In `SettingsPage.tsx`, change `function DiscordIdentityCard()` to `export function DiscordIdentityCard()`. Replace the card body (lines 141-163) with:

```tsx
  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord identity</CardTitle>
        <CardDescription>
          Link Discord to also sign in with Discord, and for recognition and @mentions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {user?.discordUsername ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span>Linked as {user.discordUsername}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => unlink.mutate()}>
                Unlink
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Discord sign-in is not protected by your authenticator app, so please enable
              two-factor authentication on your Discord account. Unlinking removes Discord sign-in.
            </p>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={() => void link()}>
            Link Discord
          </Button>
        )}
      </CardContent>
    </Card>
  );
```

- [ ] **Step 4: Run to verify it passes**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/web test -- DiscordIdentityCard`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/account/SettingsPage.tsx apps/web/src/features/account/DiscordIdentityCard.test.tsx
git commit -m "feat(auth): Settings copy for Discord login + 2FA recommendation

Linking Discord now also grants sign-in, so the card says so and, once linked,
recommends enabling 2FA on Discord (the accepted TOTP-bypass mitigation).

Part of ADR-0011.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Data migration — drop existing identity-only links

**Files:**
- Create: `apps/api/prisma/migrations/<generated>_drop_identity_only_discord_links/migration.sql`
- Test: `apps/api/src/auth/discord-link-migration.integration.spec.ts` (create)

**Interfaces:**
- Consumes: nothing (raw SQL against the `user`/`account` tables).
- Produces: on `prisma migrate deploy`, every `user` with `discord_user_id` set but no `discord` account row has its `discord_user_id`/`discord_username` nulled.

- [ ] **Step 1: Write the failing migration test**

Create `apps/api/src/auth/discord-link-migration.integration.spec.ts`:

```typescript
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";

// Mirrors migration.sql for drop_identity_only_discord_links.
const DROP_IDENTITY_ONLY_LINKS_SQL = `
UPDATE "user"
SET discord_user_id = NULL, discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND id NOT IN (SELECT user_id FROM "account" WHERE provider_id = 'discord');
`;

describe("drop_identity_only_discord_links migration", () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("clears identity-only links but leaves Discord-login accounts intact", async () => {
    // Identity-only link: user has discord fields but NO discord account row.
    const identityOnly = await createUser(prisma, {
      authMethod: "password_totp",
      discordUserId: "discord-idonly",
      discordUsername: "IdOnly",
    });
    // Discord-login account: discord fields AND a discord account row.
    const discordLogin = await createUser(prisma, {
      authMethod: "discord",
      discordUserId: "discord-login",
      discordUsername: "Login",
    });
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: discordLogin.id,
        providerId: "discord",
        accountId: "discord-login",
      },
    });

    await prisma.$executeRawUnsafe(DROP_IDENTITY_ONLY_LINKS_SQL);

    const cleared = await prisma.user.findUnique({
      where: { id: identityOnly.id },
      select: { discordUserId: true, discordUsername: true },
    });
    expect(cleared).toEqual({ discordUserId: null, discordUsername: null });

    const kept = await prisma.user.findUnique({
      where: { id: discordLogin.id },
      select: { discordUserId: true, discordUsername: true },
    });
    expect(kept).toEqual({ discordUserId: "discord-login", discordUsername: "Login" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api test -- discord-link-migration`
Expected: FAIL — before applying, the identity-only user's fields are unchanged, but note this test applies the SQL itself, so it will PASS immediately if the SQL is correct. If it PASSES here that is acceptable (the SQL is self-contained); proceed to author the migration file so production actually runs it. (This is a data-fix test, not a red-then-green unit; its value is proving the targeting.)

- [ ] **Step 3: Author the migration file**

With the local dev database running (`pnpm start` in another terminal, or a migrated DB), create an empty migration and fill it:

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api exec prisma migrate dev --create-only --name drop_identity_only_discord_links`

That creates `apps/api/prisma/migrations/<timestamp>_drop_identity_only_discord_links/migration.sql` (empty, since there is no schema change). Put this in it:

```sql
-- Data migration (ADR-0011): the meaning of a password account's Discord link
-- changed from identity-only to identity + login. Existing identity-only links
-- (a discord_user_id with no `discord` account row) linked under the old
-- "not for login" promise, so drop them; those users re-link once to opt in.
-- Discord-login accounts (which have a `discord` account row) are untouched.
UPDATE "user"
SET discord_user_id = NULL, discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND id NOT IN (SELECT user_id FROM "account" WHERE provider_id = 'discord');
```

- [ ] **Step 4: Apply locally and run the migration test**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm --filter @teambrewer/api db:migrate && pnpm --filter @teambrewer/api test -- discord-link-migration`
Expected: migration applies cleanly; test PASSES (targeting proven).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations apps/api/src/auth/discord-link-migration.integration.spec.ts
git commit -m "feat(auth): migration dropping legacy identity-only Discord links

Data migration nulls discord_user_id/username for users with a Discord link but
no discord account row, so they re-link once with explicit consent under the new
identity+login behavior. Discord-login accounts are untouched.

Part of ADR-0011.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Documentation — ADR-0011 + supersede ADR-0009 + refresh exclusivity lines

**Files:**
- Create: `docs/decisions/0011-discord-additional-login-method.md`
- Modify: `docs/decisions/0009-discord-authentication.md` (status), `docs/features/accounts-and-auth.md`, `docs/architecture/data-model.md`, `docs/architecture/security.md`, `docs/README.md`, `CLAUDE.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write ADR-0011**

Create `docs/decisions/0011-discord-additional-login-method.md`:

```markdown
# ADR-0011: Password accounts may add Discord as an additional login method

- **Status:** Accepted (2026-07-15)
- **Supersedes (in part):** [ADR-0009](0009-discord-authentication.md) — the "each account uses exactly
  one login method" rule, for the password → Discord direction.

## Context

ADR-0009 made login methods mutually exclusive and allowed a password account to link Discord for
**identity only** (no login). The product owner decided that is too restrictive: if a user links their
Discord, they should be able to sign in with **either** their password + TOTP **or** Discord — their
choice.

## Decision

- A **password + TOTP** account that links Discord can also **sign in with Discord**. Linking is one
  action: it enables login immediately; unlinking revokes it.
- Modelled with Better Auth's account table: **one `user`, two `account` rows** (`credential` +
  `discord`). `authMethod` is unchanged and is no longer the arbiter of login capability.
- **Invite-only preserved:** `disableImplicitSignUp` stays `true`; only the authenticated user's own
  Discord account row is created. Unknown Discord identities are still rejected.
- **Scope:** password → add Discord only. Discord-login accounts cannot add a password here (out of scope).
- **Existing identity-only links are dropped** on deploy (they were made under the old "not for login"
  promise), so those users re-link once for explicit consent.

## The accepted tradeoff (re-affirmed)

The Discord login path is **not** protected by the account's mandatory TOTP (2FA is delegated to Discord).
Anyone controlling the linked Discord account can sign in without the TOTP code. This is accepted for
convenience; mitigation is a clear in-app recommendation to enable Discord 2FA.

## Consequences

- `linkIdentityOnly` / `unlinkIdentity` manage the `discord` account row; login is unchanged Better Auth
  social behaviour. The dead `resolveLoginUser` helper is removed.
- A one-time data migration clears legacy identity-only links.
- ADR-0009's "allowing both methods — rejected" alternative is reversed for this direction.
```

- [ ] **Step 2: Update ADR-0009 status**

In `docs/decisions/0009-discord-authentication.md`, change the status line to:

```markdown
- **Status:** Accepted (2026-07-11); **partially superseded by [ADR-0011](0011-discord-additional-login-method.md) (2026-07-15)** — password accounts may now add Discord as an *additional* login method (previously identity-only).
```

And in its "Alternatives considered" list, change the `Allowing both methods on one account` bullet to note it was reversed:

```markdown
- **Allowing both methods on one account** — originally rejected for simplicity; **reversed for the
  password → Discord direction by [ADR-0011](0011-discord-additional-login-method.md).**
```

- [ ] **Step 3: Refresh the exclusivity lines in the docs**

Make these edits (each conveys "additional method," not "identity only / exactly one"):

- `docs/features/accounts-and-auth.md:34` — change to: `As a **password member**, I can optionally **link my Discord to also sign in with it** (and for identity/@mentions). See [ADR-0011](../decisions/0011-discord-additional-login-method.md).`
- `docs/features/accounts-and-auth.md:5` and `:45-46` — replace "exactly one login method" / "identity only" wording with "a password account may **add** Discord as an additional login method (ADR-0011)"; keep the Discord-login-account direction as-is.
- `docs/features/accounts-and-auth.md:116` and `:147` — change "identity only" to "identity + optional Discord login".
- `docs/architecture/data-model.md:41-42` — replace "exactly one login method; a `password_totp` user MAY also set `discordUserId` for identity only" with "a `password_totp` user MAY add a `discord` account row to also sign in with Discord (ADR-0011); login capability is read from the `account` table, not `authMethod`."
- `docs/architecture/security.md:16` — append: "A password account may additionally link Discord for login (ADR-0011); that path's 2FA is delegated to Discord."
- `docs/README.md:44` — soften "(one method per account)" to "(password + TOTP, optionally plus Discord login — ADR-0011)".
- `CLAUDE.md` — update the auth summary line that says "password + mandatory TOTP, or Discord SSO — invite-only" to note password accounts may add Discord login (ADR-0011).

(Do not edit `docs/plans/phase-01-auth-and-tenancy.md` — it is a historical record.)

- [ ] **Step 4: Verify no stale "identity only / not for login" claims remain in current docs**

Run: `grep -rniE "not for login|identity only|identity-only|exactly one login method" CLAUDE.md docs | grep -viE "superpowers/|phase-01|0009-discord"`
Expected: no results (all current-doc claims updated; historical/ADR-0009 references remain intentionally).

- [ ] **Step 5: Commit**

```bash
git add docs/decisions/0011-discord-additional-login-method.md docs/decisions/0009-discord-authentication.md docs/features/accounts-and-auth.md docs/architecture/data-model.md docs/architecture/security.md docs/README.md CLAUDE.md
git commit -m "docs(auth): ADR-0011 — password accounts may add Discord login

Supersede ADR-0009's exclusivity for the password -> Discord direction and
refresh the 'exactly one method / identity only' wording across the docs.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the whole local bar**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 2: Run the auth-relevant e2e (stop any dev server first)**

Run: `export PATH="$HOME/.local/share/mise/shims:$PATH" && pnpm test:e2e`
Expected: green (the setup→TOTP→app and team-isolation journeys still pass; Discord login is not e2e-covered since it needs discord.com).

- [ ] **Step 3: Manual end-to-end (documented, not automated)**

On a deploy with the migration applied and the service worker updated: link Discord on a password account (Settings), then sign out and use "Log in with Discord" → lands in the same account. Unlink → "Log in with Discord" is rejected again.

## Self-Review

- **Spec coverage:** change 1 → Task 1; change 2 (login, no code) → covered/verified in Task 1 + Task 6; change 3 (unlink) → Task 2; change 5 (`resolveLoginUser`) → Task 1 Step 6; change 4 (migration) → Task 4; UI + 2FA recommendation → Task 3; docs/ADR → Task 5. All spec sections mapped.
- **Placeholder scan:** none — all steps carry real code/SQL/commands.
- **Type consistency:** `discordLoginAccountId` defined once (Task 1) and reused (Tasks 1-2); `DISCORD_PROVIDER_ID`/`randomUUID` already imported in the service; account fields (`providerId`, `accountId`, `userId`) match `schema.prisma`; SQL columns use the `@map` snake_case names (`discord_user_id`, `provider_id`, `user_id`).
