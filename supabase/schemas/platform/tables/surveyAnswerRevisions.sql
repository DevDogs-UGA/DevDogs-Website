CREATE TABLE "platform"."surveyAnswerRevisions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"     uuid                     NOT NULL,
  "questionId" text                     NOT NULL,
  "meetingId"  uuid,
  "answer"     jsonb,
  "recordedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "surveyAnswerRevisions_answer_size" CHECK (((answer IS NULL) OR (pg_column_size(answer) <= 16384))),
  CONSTRAINT "surveyAnswerRevisions_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "surveyAnswerRevisions_pkey" PRIMARY KEY (id),
  CONSTRAINT "surveyAnswerRevisions_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "surveyAnswerRevisions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES platform."surveyQuestions"(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

ALTER TABLE "platform"."surveyAnswerRevisions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "surveyAnswerRevisions_meetingId_idx" ON platform."surveyAnswerRevisions" USING btree ("meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE INDEX "surveyAnswerRevisions_userId_questionId_idx" ON platform."surveyAnswerRevisions" USING btree ("userId", "questionId", "recordedAt" DESC);

CREATE TRIGGER "surveyAnswerRevisions_append_only"
  BEFORE DELETE OR UPDATE ON platform."surveyAnswerRevisions"
  FOR EACH ROW
  EXECUTE FUNCTION platform.reject_survey_answer_revision_mutation();

CREATE POLICY "no_client_delete" ON "platform"."surveyAnswerRevisions"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."surveyAnswerRevisions"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."surveyAnswerRevisions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_or_auditor_select" ON "platform"."surveyAnswerRevisions"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = "userId") OR platform.has_permission(( SELECT auth.uid() AS uid), 'canViewAuditLog'::text)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."surveyAnswerRevisions" TO "anon", "authenticated", "postgres", "service_role";
