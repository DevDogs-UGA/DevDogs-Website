CREATE TABLE "platform"."officerDiscordIds" (
  "userId"        uuid                     NOT NULL,
  "discordUserId" text                     NOT NULL,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "officerDiscordIds_discordUserId_snowflake_check" CHECK (("discordUserId" ~ '^[0-9]{15,25}$'::text)),
  CONSTRAINT "officerDiscordIds_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "officerDiscordIds_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."officerDiscordIds"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "officerDiscordIds_discordUserId_key" ON platform."officerDiscordIds" USING btree ("discordUserId");

CREATE POLICY "crud_public_policy_delete" ON "platform"."officerDiscordIds"
  AS RESTRICTIVE
  FOR DELETE
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_insert" ON "platform"."officerDiscordIds"
  AS RESTRICTIVE
  FOR INSERT
  TO PUBLIC
  WITH CHECK (false);

CREATE POLICY "crud_public_policy_select" ON "platform"."officerDiscordIds"
  AS RESTRICTIVE
  FOR SELECT
  TO PUBLIC
  USING (false);

CREATE POLICY "crud_public_policy_update" ON "platform"."officerDiscordIds"
  AS RESTRICTIVE
  FOR UPDATE
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."officerDiscordIds" TO "anon", "authenticated", "postgres", "service_role";
