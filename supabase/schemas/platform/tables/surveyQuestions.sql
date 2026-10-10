CREATE TABLE "platform"."surveyQuestions" (
  "id"         text                     NOT NULL,
  "scope"      text                     NOT NULL,
  "type"       text                     NOT NULL,
  "definition" jsonb                    NOT NULL,
  "retiredAt"  timestamp with time zone,
  "createdAt"  timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "surveyQuestions_definition_size" CHECK ((pg_column_size(definition) <= 16384)),
  CONSTRAINT "surveyQuestions_id_format" CHECK ((id ~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'::text)),
  CONSTRAINT "surveyQuestions_pkey" PRIMARY KEY (id),
  CONSTRAINT "surveyQuestions_scope_choices" CHECK ((scope = ANY (ARRAY['member'::text, 'meeting'::text]))),
  CONSTRAINT "surveyQuestions_type_choices" CHECK ((type = ANY (ARRAY['text'::text, 'longText'::text, 'choice'::text, 'multiChoice'::text, 'scale'::text])))
);

ALTER TABLE "platform"."surveyQuestions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_client_delete" ON "platform"."surveyQuestions"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."surveyQuestions"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."surveyQuestions"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "public_select" ON "platform"."surveyQuestions"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."surveyQuestions" TO "anon", "authenticated", "postgres", "service_role";
