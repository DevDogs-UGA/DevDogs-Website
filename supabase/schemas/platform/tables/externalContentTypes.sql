CREATE TABLE "platform"."externalContentTypes" (
  "appId"       uuid NOT NULL,
  "contentType" text NOT NULL,
  "label"       text NOT NULL,
  "urlTemplate" text,
  CONSTRAINT "externalContentTypes_appId_fkey" FOREIGN KEY ("appId") REFERENCES platform.apps(id) ON DELETE CASCADE,
  CONSTRAINT "externalContentTypes_contentType_check" CHECK (("contentType" ~ '^[a-z][a-z0-9_]{0,62}$'::text)),
  CONSTRAINT "externalContentTypes_pkey" PRIMARY KEY ("appId", "contentType")
);

ALTER TABLE "platform"."externalContentTypes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "platform"."externalContentTypes" FROM "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."externalContentTypes" TO "postgres", "service_role";
