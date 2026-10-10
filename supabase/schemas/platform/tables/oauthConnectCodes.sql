CREATE TABLE "platform"."oauthConnectCodes" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "codeHash"      text                     NOT NULL,
  "codeChallenge" text                     NOT NULL,
  "clientId"      uuid                     NOT NULL,
  "clientSecret"  text                     NOT NULL,
  "userId"        uuid                     NOT NULL,
  "redirectUri"   text                     NOT NULL,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "expiresAt"     timestamp with time zone NOT NULL DEFAULT (now() + '00:02:00'::interval),
  CONSTRAINT "oauthConnectCodes_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "oauthConnectCodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauthConnectCodes_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."oauthConnectCodes"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "oauthConnectCodes_codeHash_key" ON platform."oauthConnectCodes" USING btree ("codeHash");

CREATE INDEX "oauthConnectCodes_expiresAt_idx" ON platform."oauthConnectCodes" USING btree ("expiresAt");

CREATE POLICY "no_client_delete" ON "platform"."oauthConnectCodes"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."oauthConnectCodes"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."oauthConnectCodes"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."oauthConnectCodes" TO "anon", "authenticated", "postgres", "service_role";
