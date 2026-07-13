import type { AuthMethod, GeneratedLink, TeamRole } from "@teambrewer/shared";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import {
  useAddMember,
  useAdminMembers,
  useAdminTeams,
  useChangeRole,
  useCreateTeam,
  useCreateUser,
  useGenerateLink,
  useRemoveMember,
  useResetTwoFactor,
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
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");
  const [gameId, setGameId] = useState("flesh-and-blood");

  function submit(event: FormEvent) {
    event.preventDefault();
    createTeam.mutate({ name, gameId }, { onSuccess: () => setName("") });
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
            <Input
              id="team-game"
              value={gameId}
              onChange={(event) => setGameId(event.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={createTeam.isPending}>
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
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password_totp");
  const [role, setRole] = useState<TeamRole>("member");

  function submit(event: FormEvent) {
    event.preventDefault();
    createUser.mutate({ username, displayName, authMethod, role });
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
          <Label htmlFor="new-method">Login method</Label>
          <select
            id="new-method"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={authMethod}
            onChange={(event) => setAuthMethod(event.target.value as AuthMethod)}
          >
            <option value="password_totp">Password + TOTP</option>
            <option value="discord">Discord</option>
          </select>
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
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("member");

  function submit(event: FormEvent) {
    event.preventDefault();
    addMember.mutate({ username, role }, { onSuccess: () => setUsername("") });
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-existing-username">Existing username</Label>
        <Input
          id="add-existing-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
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
      <Button type="submit" disabled={addMember.isPending}>
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
      {link ? <CopyableLink link={link} /> : null}
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
 * The accounts + membership controls for one team. Reused for any team an
 * instance-admin selects and for a team-admin's own (active) team.
 */
function TeamAdminPanel({ teamId }: { teamId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Create a new account</h3>
        <CreateUserForm teamId={teamId} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Add an existing member</h3>
        <AddExistingMemberForm teamId={teamId} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Members</h3>
        <MembersAdmin teamId={teamId} />
      </div>
    </div>
  );
}

/**
 * Instance-admins administer any team's accounts + members without being a
 * member of it (TeamAdminGuard grants management, not data, access — see
 * multi-tenancy.md). The team to manage is chosen here, independent of the
 * membership-derived active team.
 */
function InstanceTeamManagement() {
  const teams = useAdminTeams(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const list = teams.data?.data ?? [];
  const activeId = selectedTeamId ?? list[0]?.id ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage a team</CardTitle>
        <CardDescription>
          Manage accounts and members of any team — you need not be a member (instance admin).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No teams yet. Create one above.</p>
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
            {activeId ? <TeamAdminPanel teamId={activeId} /> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminPage() {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const administersActiveTeam = activeTeam?.role === "team_admin";

  return (
    <div className="flex flex-col gap-6">
      {user?.isInstanceAdmin ? (
        <>
          <InstanceTeamsSection />
          <InstanceTeamManagement />
        </>
      ) : administersActiveTeam && activeTeam ? (
        <Card>
          <CardHeader>
            <CardTitle>{activeTeam.name} — accounts & members</CardTitle>
            <CardDescription>Create accounts and manage membership for this team.</CardDescription>
          </CardHeader>
          <CardContent>
            <TeamAdminPanel teamId={activeTeam.teamId} />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">You do not administer any team.</p>
      )}
    </div>
  );
}
