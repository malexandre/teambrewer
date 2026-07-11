import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Discord claim landing. Authorizing starts the server's custom OAuth flow
 * (GET /api/discord/claim/:token/start), which binds the returned Discord
 * identity to the provisioned account and returns the user to the login page.
 */
export function ClaimPage({ token }: { token: string }) {
  function authorize() {
    window.location.href = `/api/discord/claim/${encodeURIComponent(token)}/start`;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Claim your account with Discord</CardTitle>
          <CardDescription>
            Authorize with Discord once to link your account. Afterwards you log in with Discord.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={authorize}>
            Authorize with Discord
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
