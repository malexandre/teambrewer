-- Data migration (ADR-0011): the meaning of a password account's Discord link
-- changed from identity-only to identity + login. Existing identity-only links
-- (a discord_user_id with no `discord` account row) linked under the old
-- "not for login" promise, so drop them; those users re-link once to opt in.
-- Discord-login accounts (which have a `discord` account row) are untouched.
UPDATE "user"
SET discord_user_id = NULL, discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND id NOT IN (SELECT user_id FROM "account" WHERE provider_id = 'discord');
