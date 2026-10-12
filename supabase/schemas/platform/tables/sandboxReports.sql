CREATE TABLE "platform"."sandboxReports" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "clientId"        uuid                     NOT NULL,
  "reporterUserId"  uuid                     NOT NULL,
  "authorUserId"    uuid                     NOT NULL,
  "contentType"     text                     NOT NULL,
  "contentRef"      text                     NOT NULL,
  "contentSnapshot" character varying(5000)  NOT NULL,
  "contentUrl"      text,
  "description"     character varying(1000),
  "createdAt"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sandboxReports_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "sandboxReports_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES auth.oauth_clients(id) ON DELETE CASCADE,
  CONSTRAINT "sandboxReports_pkey" PRIMARY KEY (id),
  CONSTRAINT "sandboxReports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "platform"."sandboxReports"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."sandboxReports"
  ADD COLUMN "reason" platform."reportReason" NOT NULL;

CREATE INDEX "sandboxReports_client_idx" ON platform."sandboxReports" USING btree ("clientId", "createdAt" DESC);

REVOKE ALL ON TABLE "platform"."sandboxReports" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."sandboxReports" TO "postgres", "service_role";
