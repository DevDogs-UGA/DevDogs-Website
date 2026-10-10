CREATE TABLE "platform"."docsIndexState" (
  "id"        boolean                  NOT NULL DEFAULT true,
  "hash"      text                     NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "docsIndexState_id_check" CHECK (id),
  CONSTRAINT "docsIndexState_pkey" PRIMARY KEY (id)
);

ALTER TABLE "platform"."docsIndexState"
  ENABLE ROW LEVEL SECURITY;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."docsIndexState" TO "anon", "authenticated", "postgres", "service_role";
