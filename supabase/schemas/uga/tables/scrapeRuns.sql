CREATE TABLE "uga"."scrapeRuns" (
  "id"         bigint                   GENERATED ALWAYS AS IDENTITY,
  "job"        text                     NOT NULL,
  "startedAt"  timestamp with time zone NOT NULL,
  "finishedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "ok"         boolean                  NOT NULL,
  "report"     jsonb                    NOT NULL,
  CONSTRAINT "scrapeRuns_job_nonempty" CHECK ((btrim(job) <> ''::text)),
  CONSTRAINT "scrapeRuns_pkey" PRIMARY KEY (id)
);

ALTER TABLE "uga"."scrapeRuns"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX "scrapeRuns_job_finishedAt_idx" ON uga."scrapeRuns" USING btree (job, "finishedAt" DESC);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "uga"."scrapeRuns" TO "postgres", "service_role";

COMMENT ON TABLE "uga"."scrapeRuns" IS 'One row per finished scrape run: whether every invariant held, and the per-term report (counts, invariants, building coverage). The job heartbeat is written only when ok is true.';
