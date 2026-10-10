CREATE TABLE "platform"."docsPages" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "path"        text                     NOT NULL,
  "title"       text                     NOT NULL,
  "description" text,
  "plainText"   text                     NOT NULL,
  "updatedAt"   timestamp with time zone NOT NULL DEFAULT now(),
  "publishAt"   timestamp with time zone,
  CONSTRAINT "docsPages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."docsPages"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "platform"."docsPages"
  ADD COLUMN "search" tsvector GENERATED ALWAYS AS
    (((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(description, ''::text)),
    'B'::"char")) || setweight(to_tsvector('english'::regconfig, "plainText"), 'C'::"char"))) STORED;

CREATE UNIQUE INDEX "docsPages_path_idx" ON platform."docsPages" USING btree (path);

CREATE INDEX "docsPages_search_idx" ON platform."docsPages" USING gin (search);

CREATE POLICY "docsPages_public_read" ON "platform"."docsPages"
  FOR SELECT
  TO "anon", "authenticated"
  USING ((("publishAt" IS NULL) OR ("publishAt" <= now())));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."docsPages" TO "anon", "authenticated", "postgres", "service_role";
