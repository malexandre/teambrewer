# ADR-0003: Invite-only auth without email; mandatory TOTP 2FA

- **Status:** Accepted (2026-07-11)
- **Context:** The app must be private (no open signup), created accounts only, with a link for users to
  set their password, and 2FA. The user chose to **avoid running an email server**. Better Auth is the
  chosen auth library ([ADR-0001](0001-tech-stack.md)).

## Decision

- **No open signup.** Accounts are created by an instance-admin or team-admin.
- **No email server.** Onboarding and recovery use **single-use, expiring links** that admins generate and
  share manually (e.g. via Discord):
  - **Setup link** → user sets password + sets up TOTP + saves backup codes.
  - **Reset link** → admin-generated password reset (no self-service email reset).
- **Mandatory TOTP 2FA** for all users, with **backup codes**. Lost device → backup code or admin resets
  2FA.
- Tokens are stored **hashed**, single-use, short-lived, rate-limited.

Details and flow diagram: [`../architecture/security.md`](../architecture/security.md).

## Consequences

- No SMTP dependency or deliverability headaches; simpler self-hosting.
- Admin is in the loop for onboarding/recovery — acceptable for a 10–30 person team; a small operational
  burden on admins.
- Strong account security via mandatory 2FA.
- Must build small admin UIs for creating users and generating/copying links.

## Alternatives considered

- **Transactional email (Postmark/Resend/SES)** — rejected by user preference to avoid email; keep as a
  possible future opt-in enhancement.
- **Optional 2FA** — rejected: 2FA is mandatory per requirements.
