CREATE TABLE "platform"."oauthDeviceCodes" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "deviceCodeHash" text                     NOT NULL,
  "userCodeHash"   text                     NOT NULL,
  "label"          text                     NOT NULL,
  "callbackUri"    text                     NOT NULL,
  "userId"         uuid,
  "clientId"       uuid,
  "clientSecret"   text,
  "interval"       integer                  NOT NULL DEFAULT 5,
  "lastPolledAt"   timestamp with time zone,
  "createdAt"      timestamp with time zone NOT NULL DEFAULT now(),
  "expiresAt"      timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  CONSTRAINT "oauthDeviceCodes_clientId_oauth_clients_id_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "oauthDeviceCodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauthDeviceCodes_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."oauthDeviceCodes"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."oauthDeviceCodes"
  ADD COLUMN "status" platform."oauthDeviceCodeStatus" NOT NULL DEFAULT 'pending'::platform."oauthDeviceCodeStatus";

CREATE UNIQUE INDEX "oauthDeviceCodes_deviceCodeHash_key" ON platform."oauthDeviceCodes" USING btree ("deviceCodeHash");

CREATE INDEX "oauthDeviceCodes_expiresAt_idx" ON platform."oauthDeviceCodes" USING btree ("expiresAt");

CREATE UNIQUE INDEX "oauthDeviceCodes_userCodeHash_key" ON platform."oauthDeviceCodes" USING btree ("userCodeHash");

CREATE POLICY "no_client_delete" ON "platform"."oauthDeviceCodes"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."oauthDeviceCodes"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."oauthDeviceCodes"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."oauthDeviceCodes" TO "anon", "authenticated", "postgres", "service_role";
