CREATE TABLE "platform"."supportForumPosts" (
  "threadId"        text                     NOT NULL,
  "title"           text                     NOT NULL,
  "question"        text                     NOT NULL,
  "answerMessageId" text,
  "answer"          text,
  "tags"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "isResolved"      boolean                  NOT NULL DEFAULT false,
  "isFaq"           boolean                  NOT NULL DEFAULT false,
  "lastMessageId"   text,
  "createdAt"       timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supportForumPosts_pkey" PRIMARY KEY ("threadId")
);

ALTER TABLE "platform"."supportForumPosts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."supportForumPosts"
  ADD COLUMN "search" tsvector GENERATED ALWAYS AS
    (((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(question, ''::text)),
    'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(answer, ''::text)), 'C'::"char"))) STORED;

CREATE INDEX "supportForumPosts_search_idx" ON platform."supportForumPosts" USING gin (search);

CREATE POLICY "no_client_delete" ON "platform"."supportForumPosts"
  AS RESTRICTIVE
  FOR DELETE
  TO "anon", "authenticated"
  USING (false);

CREATE POLICY "no_client_insert" ON "platform"."supportForumPosts"
  AS RESTRICTIVE
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (false);

CREATE POLICY "no_client_update" ON "platform"."supportForumPosts"
  AS RESTRICTIVE
  FOR UPDATE
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."supportForumPosts" TO "anon", "authenticated", "postgres", "service_role";
