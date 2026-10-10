CREATE TABLE "platform"."auditEvents" (
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "createdAt"                  timestamp with time zone NOT NULL DEFAULT now(),
  "actorType"                  text                     NOT NULL,
  "actorUserId"                uuid,
  "action"                     text                     NOT NULL,
  "targetType"                 text                     NOT NULL,
  "targetId"                   text                     NOT NULL,
  "correlationId"              text,
  "metadata"                   jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "beforeReflectionRevisionId" uuid,
  "afterReflectionRevisionId"  uuid,
  CONSTRAINT "auditEvents_action_length" CHECK ((char_length(action) <= 120)),
  CONSTRAINT "auditEvents_actorType_choices" CHECK (("actorType" = ANY (ARRAY['user'::text, 'system'::text]))),
  CONSTRAINT "auditEvents_actor_shape" CHECK (((("actorType" = 'user'::text) AND ("actorUserId" IS NOT NULL)) OR (("actorType" = 'system'::text) AND ("actorUserId" IS NULL)))),
  CONSTRAINT "auditEvents_metadata_bounded" CHECK ((pg_column_size(metadata) <= 16384)),
  CONSTRAINT "auditEvents_pkey" PRIMARY KEY (id),
  CONSTRAINT "auditEvents_targetId_length" CHECK ((char_length("targetId") <= 255)),
  CONSTRAINT "auditEvents_targetType_length" CHECK ((char_length("targetType") <= 80)),
  CONSTRAINT "auditEvents_afterReflectionRevisionId_fkey" FOREIGN KEY ("afterReflectionRevisionId") REFERENCES platform."reflectionRevisions"(id) ON DELETE SET NULL,
  CONSTRAINT "auditEvents_beforeReflectionRevisionId_fkey" FOREIGN KEY ("beforeReflectionRevisionId") REFERENCES platform."reflectionRevisions"(id) ON DELETE SET NULL
);

ALTER TABLE "platform"."auditEvents"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."auditEvents"
  ADD COLUMN "source" platform."auditEventSource" NOT NULL;

CREATE UNIQUE INDEX "auditEvents_correlation_idempotency_key" ON platform."auditEvents" USING btree (source, "correlationId", action, "targetType", "targetId")
  WHERE ("correlationId" IS NOT NULL);

CREATE INDEX "auditEvents_createdAt_idx" ON platform."auditEvents" USING btree ("createdAt" DESC, id DESC);

CREATE INDEX "auditEvents_target_idx" ON platform."auditEvents" USING btree ("targetType", "targetId", "createdAt" DESC);

CREATE TRIGGER "auditEvents_append_only"
  BEFORE DELETE OR UPDATE ON platform."auditEvents"
  FOR EACH ROW
  EXECUTE FUNCTION platform.reject_audit_event_mutation();

CREATE POLICY "auditor_select" ON "platform"."auditEvents"
  FOR SELECT
  TO "authenticated"
  USING (platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text));

CREATE POLICY "no_client_delete" ON "platform"."auditEvents"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."auditEvents"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."auditEvents"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."auditEvents" TO "anon", "authenticated", "postgres", "service_role";
