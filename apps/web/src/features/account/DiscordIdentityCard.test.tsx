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
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  authMethod: "password_totp",
  isInstanceAdmin: false,
  totpEnabled: true,
};

describe("DiscordIdentityCard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tells an unlinked password account that linking also enables sign-in", async () => {
    mockMe({ ...baseUser, discordUserId: null, discordUsername: null });
    renderCard();
    await waitFor(() => expect(screen.getByText(/also sign in with Discord/i)).toBeInTheDocument());
  });

  it("shows the Discord 2FA recommendation once linked", async () => {
    mockMe({ ...baseUser, discordUserId: "discord-1", discordUsername: "alice#1" });
    renderCard();
    await waitFor(() => expect(screen.getByText(/Linked as alice#1/)).toBeInTheDocument());
    expect(screen.getByText(/enable two-factor.*Discord/i)).toBeInTheDocument();
  });
});
