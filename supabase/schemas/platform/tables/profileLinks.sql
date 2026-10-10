CREATE TABLE "platform"."profileLinks" (
  "id"        uuid                        NOT NULL DEFAULT gen_random_uuid(),
  "userId"    uuid                        NOT NULL,
  "url"       text                        NOT NULL,
  "title"     character varying(64)       NOT NULL,
  "sortOrder" double precision            NOT NULL DEFAULT 0,
  "createdAt" timestamp without time zone DEFAULT now(),
  CONSTRAINT "profileLinks_pkey" PRIMARY KEY (id),
  CONSTRAINT "profileLinks_userId_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES platform.profile("userId") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "profileLinks_userId_sortOrder_key" UNIQUE ("userId", "sortOrder")
);

ALTER TABLE "platform"."profileLinks"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crud_authenticated_policy_delete" ON "platform"."profileLinks"
  FOR DELETE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))));

CREATE POLICY "crud_authenticated_policy_insert" ON "platform"."profileLinks"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))));

CREATE POLICY "crud_authenticated_policy_select" ON "platform"."profileLinks"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

CREATE POLICY "crud_authenticated_policy_update" ON "platform"."profileLinks"
  FOR UPDATE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_profile_frozen("userId")) AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = "userId") AND (NOT platform.is_suspended(( SELECT auth.uid() AS uid)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."profileLinks" TO "anon", "authenticated", "postgres", "service_role";
