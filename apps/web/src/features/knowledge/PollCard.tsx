import type { Poll } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { useCastVote, useRetractVote, useUpdatePoll } from "./use-poll-mutations";

/**
 * One poll: the question, its options as large tap targets (each shows the running count
 * + percentage), the caller's current choice highlighted, and a close/reopen control for
 * the author or a team-admin. Voting is disabled once the poll is (effectively) closed.
 */
export function PollCard({ teamId, poll }: { teamId: string | undefined; poll: Poll }) {
  const { activeTeam } = useActiveTeam();
  const { data: user } = useCurrentUser();
  const castVote = useCastVote(teamId, poll.id);
  const retractVote = useRetractVote(teamId, poll.id);
  const updatePoll = useUpdatePoll(teamId, poll.id);

  const isClosed = poll.status === "closed";
  const canManage = poll.authorId === user?.id || activeTeam?.role === "team_admin";
  const resultByOption = new Map(poll.results.map((result) => [result.optionId, result]));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">{poll.question}</CardTitle>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              isClosed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
            }`}
          >
            {isClosed ? "Closed" : "Open"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
          {poll.closesAt ? ` · closes ${new Date(poll.closesAt).toLocaleString()}` : ""}
          {` · by ${poll.author.displayName}`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {poll.options.map((option) => {
            const result = resultByOption.get(option.id);
            const percentage = result?.percentage ?? 0;
            const isMyVote = poll.myVoteOptionId === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={isClosed || castVote.isPending}
                  aria-pressed={isMyVote}
                  onClick={() => castVote.mutate(option.id)}
                  className={`relative w-full overflow-hidden rounded-md border p-2 text-left text-sm disabled:cursor-not-allowed ${
                    isMyVote ? "border-primary font-medium" : "border-input"
                  }`}
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-primary/10"
                    style={{ width: `${percentage}%` }}
                  />
                  <span className="relative flex items-center justify-between gap-2">
                    <span>
                      {isMyVote ? "✓ " : ""}
                      {option.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {result?.count ?? 0} · {percentage}%
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          {!isClosed && poll.myVoteOptionId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={retractVote.isPending}
              onClick={() => retractVote.mutate()}
            >
              Retract vote
            </Button>
          ) : null}
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={updatePoll.isPending}
              onClick={() => updatePoll.mutate({ status: isClosed ? "open" : "closed" })}
            >
              {isClosed ? "Reopen" : "Close poll"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
