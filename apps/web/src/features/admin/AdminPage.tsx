import type { GeneratedLink, TeamRole } from "@teambrewer/shared";
import { type FormEvent, type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import {
  useAddMember,
  useAdminMembers,
  useAdminTeams,
  useCandidateUsers,
  useChangeRole,
  useCreateTeam,
  useCreateUser,
  useGameCatalog,
  useGenerateLink,
  useRemoveMember,
  useResetTwoFactor,
  useRevokeLink,
  useRevokeSessions,
} from "./use-admin";

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong.";
}

function CopyableLink({ link }: { link: GeneratedLink }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted p-2 text-xs">
      <span className="font-medium">Share this {link.purpose.replace("_", " ")} link:</span>
      <div className="flex items-center gap-2">
        <code data-testid="generated-link" className="break-all">
          {link.url}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void navigator.clipboard?.writeText(link.url)}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

function InstanceTeamsSection() {
  const teams = useAdminTeams(true);
  const games = useGameCatalog();
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState("");
  const gameOptions = games.data?.data ?? [];
  // Default to the first supported game once the catalog loads.
  const selectedGameId = gameId || gameOptions[0]?.id || "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedGameId) {
      return;
    }
    createTeam.mutate({ name, gameId: selectedGameId }, { onSuccess: () => setName("") });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Create and review teams (instance admin).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="team-game">Game</Label>
            <select
              id="team-game"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={selectedGameId}
              onChange={(event) => setGameId(event.target.value)}
              disabled={gameOptions.length === 0}
              required
            >
              {gameOptions.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={createTeam.isPending || !selectedGameId}>
            Create team
          </Button>
        </form>
        {createTeam.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {messageFor(createTeam.error)}
          </p>
        ) : null}
        <ul className="divide-y divide-border text-sm">
          {teams.data?.data.map((team) => (
            <li key={team.id} className="flex justify-between py-2">
              <span>{team.name}</span>
              <span className="text-muted-foreground">
                {team.gameId}
                {team.archivedAt ? " · archived" : ""}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CreateUserForm({ teamId }: { teamId: string }) {
  const createUser = useCreateUser(teamId);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<TeamRole>("member");

  function submit(event: FormEvent) {
    event.preventDefault();
    createUser.mutate({ username, displayName, role });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-username">Username</Label>
          <Input
            id="new-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-display">Display name</Label>
          <Input
            id="new-display"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-role">Role</Label>
          <select
            id="new-role"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={role}
            onChange={(event) => setRole(event.target.value as TeamRole)}
          >
            <option value="member">Member</option>
            <option value="team_admin">Team admin</option>
          </select>
        </div>
      </div>
      <Button type="submit" disabled={createUser.isPending}>
        Create account
      </Button>
      {createUser.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageFor(createUser.error)}
        </p>
      ) : null}
      {createUser.data ? <CopyableLink link={createUser.data.link} /> : null}
    </form>
  );
}

function AddExistingMemberForm({ teamId }: { teamId: string }) {
  const addMember = useAddMember(teamId);
  const candidates = useCandidateUsers(teamId);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const candidateOptions = candidates.data?.data ?? [];

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!username) {
      return;
    }
    addMember.mutate({ username, role }, { onSuccess: () => setUsername("") });
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-existing-username">Existing account</Label>
        <select
          id="add-existing-username"
          className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          disabled={candidateOptions.length === 0}
          required
        >
          <option value="" disabled>
            {candidateOptions.length === 0 ? "No accounts available" : "Select an account…"}
          </option>
          {candidateOptions.map((candidate) => (
            <option key={candidate.id} value={candidate.username}>
              {candidate.displayName} (@{candidate.username})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-existing-role">Role</Label>
        <select
          id="add-existing-role"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as TeamRole)}
        >
          <option value="member">Member</option>
          <option value="team_admin">Team admin</option>
        </select>
      </div>
      <Button type="submit" disabled={addMember.isPending || !username}>
        Add member
      </Button>
      {addMember.isError ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {messageFor(addMember.error)}
        </p>
      ) : null}
    </form>
  );
}

function MembersAdmin({ teamId }: { teamId: string }) {
  const members = useAdminMembers(teamId);
  const changeRole = useChangeRole(teamId);
  const removeMember = useRemoveMember(teamId);
  const generateLink = useGenerateLink(teamId);
  const revokeLink = useRevokeLink(teamId);
  const resetTwoFactor = useResetTwoFactor(teamId);
  const revokeSessions = useRevokeSessions(teamId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [link, setLink] = useState<GeneratedLink | null>(null);

  function run(promise: Promise<unknown>) {
    setActionError(null);
    promise.catch((error) => setActionError(messageFor(error)));
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      {/* Show a freshly generated link in a dialog so it's unmissable regardless of how far
          down the members list the admin acted. */}
      <Dialog open={Boolean(link)} onClose={() => setLink(null)} title="Invite link">
        {link ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Share this link with the teammate — it can only be used once and expires.
            </p>
            <CopyableLink link={link} />
          </div>
        ) : null}
      </Dialog>
      <ul className="divide-y divide-border">
        {members.data?.data.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span className="font-medium">
              {member.displayName} <span className="text-muted-foreground">({member.role})</span>
            </span>
            <span className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    changeRole.mutateAsync({
                      userId: member.userId,
                      role: member.role === "team_admin" ? "member" : "team_admin",
                    }),
                  )
                }
              >
                {member.role === "team_admin" ? "Demote" : "Promote"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    generateLink
                      .mutateAsync({ userId: member.userId, kind: "setup-link" })
                      .then((generated) => setLink(generated)),
                  )
                }
              >
                New invite link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => run(revokeLink.mutateAsync(member.userId).then(() => setLink(null)))}
              >
                Revoke link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    generateLink
                      .mutateAsync({ userId: member.userId, kind: "reset-link" })
                      .then((generated) => setLink(generated)),
                  )
                }
              >
                Reset link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => run(resetTwoFactor.mutateAsync(member.userId))}
              >
                Reset 2FA
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => run(revokeSessions.mutateAsync(member.userId))}
              >
                Sign out
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => run(removeMember.mutateAsync(member.userId))}
              >
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Resolves which team the admin acts on, then renders its section(s): an
 * instance-admin picks any team (TeamAdminGuard grants management, not data,
 * access — see multi-tenancy.md); a team-admin acts on their active team;
 * anyone else is told they administer nothing. Shared by the Accounts and
 * Members admin sub-pages so both scope to the same team-selection behaviour.
 */
function AdminTeamScope({
  description,
  children,
}: {
  description: string;
  children: (teamId: string) => ReactNode;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const isInstanceAdmin = Boolean(user?.isInstanceAdmin);
  const teams = useAdminTeams(isInstanceAdmin);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  if (isInstanceAdmin) {
    const list = teams.data?.data ?? [];
    const activeId = selectedTeamId ?? list[0]?.id ?? null;
    return (
      <Card>
        <CardHeader>
          <CardTitle>Manage a team</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet. Create one under Teams.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="manage-team">Team</Label>
                <select
                  id="manage-team"
                  className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm"
                  value={activeId ?? ""}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                >
                  {list.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              {activeId ? children(activeId) : null}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (activeTeam?.role === "team_admin") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{activeTeam.name}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children(activeTeam.teamId)}</CardContent>
      </Card>
    );
  }

  return <p className="text-sm text-muted-foreground">You do not administer any team.</p>;
}

/** Admin › Teams — instance-only team creation and the team list. */
export function AdminTeamsPage() {
  const { data: user } = useCurrentUser();
  if (!user?.isInstanceAdmin) {
    return <p className="text-sm text-muted-foreground">Only instance admins can create teams.</p>;
  }
  return <InstanceTeamsSection />;
}

/** Admin › Accounts — create accounts and share setup links for a team. */
export function AdminAccountsPage() {
  return (
    <AdminTeamScope description="Create accounts and share setup links for this team.">
      {(teamId) => <CreateUserForm teamId={teamId} />}
    </AdminTeamScope>
  );
}

/** Admin › Members — add existing accounts to a team and manage their roles. */
export function AdminMembersPage() {
  return (
    <AdminTeamScope description="Add existing accounts and manage roles for this team.">
      {(teamId) => (
        <div className="flex flex-col gap-6">
          <Section title="Add an existing member" aria-label="Add an existing member">
            <AddExistingMemberForm teamId={teamId} />
          </Section>
          <Section title="Members" aria-label="Members">
            <MembersAdmin teamId={teamId} />
          </Section>
        </div>
      )}
    </AdminTeamScope>
  );
}
