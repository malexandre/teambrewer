import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { inviteStatusSchema, onboardingResultSchema } from "@teambrewer/shared";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiClient } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

import { AuthenticatorEnrollment } from "./AuthenticatorEnrollment";

type Step = "password" | "enroll" | "backup";

function secretFromTotpUri(totpUri: string): string {
  try {
    return new URL(totpUri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

export function SetupPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // null while checking; false once we know the link is spent/expired/revoked.
  const [linkValid, setLinkValid] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/onboarding/invite/${token}`, { schema: inviteStatusSchema })
      .then((status) => {
        if (!cancelled) setLinkValid(status.valid);
      })
      .catch(() => {
        if (!cancelled) setLinkValid(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { username } = await apiClient.post("/onboarding/setup/" + token, {
        body: { password },
        schema: onboardingResultSchema,
      });
      const signIn = await authClient.signIn.username({ username, password });
      if (signIn.error) {
        throw new Error("Could not sign in after setting the password.");
      }
      const enrolment = await authClient.twoFactor.enable({ password });
      if (enrolment.error || !enrolment.data) {
        throw new Error("Could not start two-factor setup.");
      }
      setTotpUri(enrolment.data.totpURI);
      setSecret(secretFromTotpUri(enrolment.data.totpURI));
      setBackupCodes(enrolment.data.backupCodes);
      setStep("enroll");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? "This setup link is invalid or has expired."
          : caught instanceof Error
            ? caught.message
            : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (verifyError) {
      setError("That code is not valid — check your authenticator and try again.");
      return;
    }
    setStep("backup");
  }

  function continueWithDiscord() {
    // Claim the same invite with Discord instead of a password; the account's
    // login method is committed to Discord on the OAuth callback (ADR-0009).
    window.location.href = `/api/discord/claim/${encodeURIComponent(token)}/start`;
  }

  function downloadBackupCodes() {
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "teambrewer-backup-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function finish() {
    await queryClient.invalidateQueries();
    await navigate({ to: "/" });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Set up your account</CardTitle>
          <CardDescription>
            {step === "password"
              ? "Set a password (at least 12 characters) and enable 2FA — or connect Discord instead."
              : step === "enroll"
                ? "Add TeamBrewer to your authenticator app, then enter a code."
                : "Save your backup codes — they are shown only once."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {step === "password" ? (
            linkValid === false ? (
              <p role="alert" className="text-sm text-destructive">
                This link is no longer valid. Ask a team admin for a new invite link.
              </p>
            ) : linkValid === null ? (
              <p className="text-sm text-muted-foreground">Checking your link…</p>
            ) : (
              <div className="flex flex-col gap-4">
                <form className="flex flex-col gap-4" onSubmit={submitPassword}>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
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
                    {pending ? "Setting up…" : "Continue"}
                  </Button>
                </form>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Prefer Discord? Connect it instead — you’ll sign in with Discord from then on.
                  </p>
                  <Button type="button" variant="outline" onClick={continueWithDiscord}>
                    Continue with Discord
                  </Button>
                </div>
              </div>
            )
          ) : step === "enroll" ? (
            <form className="flex flex-col gap-4" onSubmit={submitCode}>
              <AuthenticatorEnrollment totpUri={totpUri} secret={secret} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Authenticator code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
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
                {pending ? "Verifying…" : "Verify and continue"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <ul
                data-testid="backup-codes"
                className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-3 font-mono text-xs"
              >
                {backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={downloadBackupCodes}>
                  Download codes
                </Button>
                <Button type="button" onClick={finish}>
                  Continue to app
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
