CREATE TABLE "platform"."surveyAnswers" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "userId"     uuid                     NOT NULL,
  "questionId" text                     NOT NULL,
  "meetingId"  uuid,
  "answer"     jsonb                    NOT NULL,
  "createdAt"  timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "surveyAnswers_answer_size" CHECK ((pg_column_size(answer) <= 16384)),
  CONSTRAINT "surveyAnswers_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES platform.meetings(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "surveyAnswers_pkey" PRIMARY KEY (id),
  CONSTRAINT "surveyAnswers_userId_fkey" FOREIGN KEY ("userId") REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "surveyAnswers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES platform."surveyQuestions"(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

ALTER TABLE "platform"."surveyAnswers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "surveyAnswers_meetingId_idx" ON platform."surveyAnswers" USING btree ("meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE UNIQUE INDEX "surveyAnswers_meeting_key" ON platform."surveyAnswers" USING btree ("userId", "questionId", "meetingId")
  WHERE ("meetingId" IS NOT NULL);

CREATE UNIQUE INDEX "surveyAnswers_member_key" ON platform."surveyAnswers" USING btree ("userId", "questionId")
  WHERE ("meetingId" IS NULL);

CREATE INDEX "surveyAnswers_questionId_idx" ON platform."surveyAnswers" USING btree ("questionId");

CREATE POLICY "no_client_delete" ON "platform"."surveyAnswers"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."surveyAnswers"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."surveyAnswers"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "own_select" ON "platform"."surveyAnswers"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = "userId"));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."surveyAnswers" TO "anon", "authenticated", "postgres", "service_role";
