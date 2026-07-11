/**
 * The slice of Discord's OAuth2 we use for claim/identity binding: build the
 * authorize URL and exchange an authorization code for the user's identity
 * (`identify` scope only — no email, per ADR-0009). Behind an interface so tests
 * inject a deterministic fake instead of calling discord.com.
 */
export interface DiscordProfile {
  discordUserId: string;
  discordUsername: string;
}

export interface DiscordOAuthClient {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<DiscordProfile>;
}

export const DISCORD_OAUTH_CLIENT = Symbol("DISCORD_OAUTH_CLIENT");

const DISCORD_API_BASE = "https://discord.com/api";

/** Real client. Talks to Discord's own OAuth2 endpoints (not scraping — ADR-0007). */
export class DiscordOAuthHttpClient implements DiscordOAuthClient {
  authorizeUrl(state: string, redirectUri: string): string {
    const clientId = process.env["DISCORD_CLIENT_ID"] ?? "";
    const url = new URL(`${DISCORD_API_BASE}/oauth2/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "none");
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<DiscordProfile> {
    const clientId = process.env["DISCORD_CLIENT_ID"] ?? "";
    const clientSecret = process.env["DISCORD_CLIENT_SECRET"] ?? "";
    const tokenResponse = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      throw new Error("Discord token exchange failed.");
    }
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new Error("Discord token exchange returned no access token.");
    }

    const profileResponse = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) {
      throw new Error("Discord profile fetch failed.");
    }
    const profile = (await profileResponse.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
    };
    return {
      discordUserId: profile.id,
      discordUsername: profile.global_name ?? profile.username,
    };
  }
}
