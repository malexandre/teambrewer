import { z } from "zod";

import { displayNameSchema, teamRoleSchema } from "./auth.js";

/**
 * Shared team & membership contracts (see teams-and-membership.md). A team is an
 * isolated workspace bound to exactly one game; membership links a user to a team
 * with a per-team role. `teamId` for scoping always comes from the verified
 * request context (`X-Team-Id`), never a request body.
 */

export const teamNameSchema = z
  .string()
  .min(1, "Team name is required")
  .max(100, "Team name must be at most 100 characters");

/** Create a team (instance-admin only); the game is fixed for the team's life. */
export const createTeamSchema = z.object({
  name: teamNameSchema,
  gameId: z.string().min(1, "A game is required"),
  firstAdminUserId: z.string().min(1).optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

/**
 * Add an existing user to a team with a role (team-admin/instance-admin). The
 * user is identified by exactly one of `userId` (e.g. from the roster) or
 * `username` (e.g. typed into the admin console); the server resolves it.
 */
export const createMembershipSchema = z
  .object({
    userId: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    role: teamRoleSchema,
  })
  .refine((value) => Boolean(value.userId) !== Boolean(value.username), {
    message: "Provide exactly one of userId or username.",
  });
export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

/** Change a member's role within a team. */
export const updateMembershipSchema = z.object({
  role: teamRoleSchema,
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;

/** A team the authenticated user belongs to, with their role in it. */
export const teamMembershipSummarySchema = z.object({
  teamId: z.string(),
  name: teamNameSchema,
  slug: z.string(),
  gameId: z.string(),
  role: teamRoleSchema,
});
export type TeamMembershipSummary = z.infer<typeof teamMembershipSummarySchema>;

/** Response for `GET /api/me/teams` — drives the active-team selector. */
export const myTeamsResponseSchema = z.object({
  data: z.array(teamMembershipSummarySchema),
});
export type MyTeamsResponse = z.infer<typeof myTeamsResponseSchema>;

/** A member of a team, as listed on the members screen. */
export const teamMemberSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: displayNameSchema,
  role: teamRoleSchema,
  joinedAt: z.string(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamMemberListSchema = z.object({
  data: z.array(teamMemberSchema),
});
export type TeamMemberList = z.infer<typeof teamMemberListSchema>;

/** A team as seen by an instance-admin managing the instance. */
export const teamSummarySchema = z.object({
  id: z.string(),
  name: teamNameSchema,
  slug: z.string(),
  gameId: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type TeamSummary = z.infer<typeof teamSummarySchema>;

export const teamListSchema = z.object({
  data: z.array(teamSummarySchema),
});
export type TeamList = z.infer<typeof teamListSchema>;
