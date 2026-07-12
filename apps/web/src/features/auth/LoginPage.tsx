import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Step = "credentials" | "totp";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function finishLogin() {
    await queryClient.invalidateQueries();
    await navigate({ to: "/" });
  }

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { data, error: signInError } = await authClient.signIn.username({ username, password });
    setPending(false);
    if (signInError) {
      setError("Incorrect username or password.");
      return;
    }
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    await finishLogin();
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: verifyError } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (verifyError) {
      setError(useBackupCode ? "That backup code is not valid." : "That code is not valid.");
      return;
    }
    await finishLogin();
  }

  function signInWithDiscord() {
    void authClient.signIn.social({ provider: "discord", callbackURL: "/" });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to TeamBrewer</CardTitle>
          <CardDescription>
            {step === "credentials"
              ? "Use your username and password."
              : useBackupCode
                ? "Enter one of your backup codes."
                : "Enter the 6-digit code from your authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "credentials" ? (
            <form className="flex flex-col gap-4" onSubmit={submitCredentials}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Signing in…" : "Continue"}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={submitCode}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">{useBackupCode ? "Backup code" : "Authenticator code"}</Label>
                <Input
                  id="code"
                  inputMode={useBackupCode ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Verifying…" : "Verify"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setUseBackupCode((previous) => !previous);
                  setCode("");
                  setError(null);
                }}
              >
                {useBackupCode ? "Use your authenticator app instead" : "Use a backup code instead"}
              </button>
            </form>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={signInWithDiscord}>
              Log in with Discord
            </Button>
            <p className="text-xs text-muted-foreground">
              Lost your device or password? Ask an admin for a reset link.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
