import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { useCurrentUser } from "./use-current-user";

/**
 * Gate for authenticated routes. A 401 from GET /api/me means "not fully
 * authenticated" (no session, or a password account that has not finished its
 * mandatory TOTP), so the user is sent to the login page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { isPending, isError } = useCurrentUser();

  useEffect(() => {
    if (isError) {
      void navigate({ to: "/login" });
    }
  }, [isError, navigate]);

  if (isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }

  if (isError) {
    return null;
  }

  return <>{children}</>;
}
