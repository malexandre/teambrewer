import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { PrimerDetail } from "./PrimerDetail";

/** Detail route for a single primer; wraps {@link PrimerDetail} with a back link. */
export function PrimerDetailPage({ primerId }: { primerId: string }) {
  return (
    <Card>
      <CardHeader>
        <Link to="/knowledge" className="text-sm text-muted-foreground hover:underline">
          ← Back to knowledge
        </Link>
        <CardTitle className="sr-only">Primer</CardTitle>
      </CardHeader>
      <CardContent>
        <PrimerDetail primerId={primerId} />
      </CardContent>
    </Card>
  );
}
