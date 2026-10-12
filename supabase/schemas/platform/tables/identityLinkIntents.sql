CREATE TABLE "platform"."identityLinkIntents" (
  "userId"    uuid                     NOT NULL,
  "provider"  text                     NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  CONSTRAINT "identityLinkIntents_pkey" PRIMARY KEY ("userId", "provider"),
  CONSTRAINT "identityLinkIntents_userId_users_id_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE "platform"."identityLinkIntents"
  ENABLE ROW LEVEL SECURITY;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."identityLinkIntents" TO "postgres", "service_role";
