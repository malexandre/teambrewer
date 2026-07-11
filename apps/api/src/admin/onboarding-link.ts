import type { GeneratedLink } from "@teambrewer/shared";

import type { InviteTokenPurpose } from "../generated/prisma/enums.js";

/** The web routes that consume each kind of onboarding/recovery link (Slice 5). */
const LINK_PATH: Record<InviteTokenPurpose, string> = {
  setup: "setup",
  reset: "reset",
  discord_link: "claim",
};

/**
 * Build the copyable link an admin shares manually (there is no email — ADR-0003).
 * It points at the web app, which drives the matching consumption flow.
 */
export function buildOnboardingLink(
  purpose: InviteTokenPurpose,
  rawToken: string,
  expiresAt: Date,
): GeneratedLink {
  const webOrigin = process.env["WEB_ORIGIN"] ?? "http://localhost:5173";
  return {
    purpose,
    url: `${webOrigin}/${LINK_PATH[purpose]}/${rawToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}
