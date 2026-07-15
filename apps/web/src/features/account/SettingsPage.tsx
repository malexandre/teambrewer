import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionListSchema } from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";

function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.mySessions(),
    queryFn: () => apiClient.get("/me/sessions", { schema: sessionListSchema }),
  });
  const revoke = useMutation({
    mutationFn: (sessionId: string) => apiClient.delete(`/me/sessions/${sessionId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.mySessions() }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Sign out sessions you no longer recognise.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border text-sm">
          {sessions.data?.data.map((session) => (
            <li key={session.id} className="flex items-center justify-between py-2">
              <span>
                {session.userAgent ?? "Unknown device"}
                {session.isCurrent ? " · this device" : ""}
              </span>
              {session.isCurrent ? null : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => revoke.mutate(session.id)}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setError(null);
    const { error: changeError } = await authClient.changePassword({
      currentPassword,
      newPassword,
    });
    if (changeError) {
      setError("Could not change your password. Check your current password.");
      return;
    }
    setStatus("Password updated.");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="text-sm text-muted-foreground">
              {status}
            </p>
          ) : null}
          <Button type="submit">Update password</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function DiscordIdentityCard() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  const unlink = useMutation({
    mutationFn: () => apiClient.delete("/me/discord/link"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
  });

  async function link() {
    const { authorizeUrl } = await apiClient.post<{ authorizeUrl: string }>("/me/discord/link");
    window.location.href = authorizeUrl;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discord identity</CardTitle>
        <CardDescription>
          Link Discord for recognition and @mentions (not for login).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user?.discordUsername ? (
          <div className="flex items-center justify-between text-sm">
            <span>Linked as {user.discordUsername}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => unlink.mutate()}>
              Unlink
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => void link()}>
            Link Discord
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function DataSourcesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About &amp; data sources</CardTitle>
        <CardDescription>Where TeamBrewer&rsquo;s card data comes from.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Flesh and Blood card data is synced from{" "}
            <a
              href="https://github.com/the-fab-cube/flesh-and-blood-cards"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
            >
              the-fab-cube/flesh-and-blood-cards
            </a>
            . Card names, text, and artwork are the intellectual property of Legend Story Studios.
            TeamBrewer is an unofficial fan tool, not affiliated with, endorsed by, or sponsored by
            Legend Story Studios.
          </p>
          <p>TeamBrewer is free software licensed under the GNU AGPL-3.0.</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { data: user } = useCurrentUser();
  const isPasswordAccount = user?.authMethod === "password_totp";

  return (
    <div className="flex flex-col gap-6">
      <SessionsCard />
      {isPasswordAccount ? <ChangePasswordCard /> : null}
      {isPasswordAccount ? <DiscordIdentityCard /> : null}
      <DataSourcesCard />
    </div>
  );
}
