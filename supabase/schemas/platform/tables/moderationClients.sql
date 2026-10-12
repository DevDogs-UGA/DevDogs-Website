CREATE TABLE "platform"."moderationClients" (
  "clientId"      uuid                     NOT NULL,
  "appId"         uuid,
  "endpointUrl"   text,
  "secretVersion" integer                  NOT NULL DEFAULT 1,
  "createdAt"     timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "moderationClients_appId_fkey" FOREIGN KEY ("appId") REFERENCES platform.apps(id) ON DELETE SET NULL,
  CONSTRAINT "moderationClients_appId_key" UNIQUE ("appId"),
  CONSTRAINT "moderationClients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "moderationClients_endpoint_https_check" CHECK ((("endpointUrl" IS NULL) OR ("endpointUrl" ~ '^https://[^[:space:]]+$'::text))),
  CONSTRAINT "moderationClients_pkey" PRIMARY KEY ("clientId"),
  CONSTRAINT "moderationClients_secretVersion_check" CHECK (("secretVersion" >= 1))
);

ALTER TABLE "platform"."moderationClients"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "platform"."moderationClients" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."moderationClients" TO "postgres", "service_role";
