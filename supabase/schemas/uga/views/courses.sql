CREATE VIEW "uga"."courses" AS  SELECT c.id,
    c.abbr,
    c.title,
    c."abbrTitle",
    c."courseNumber",
    c."minCreditHours",
    c."maxCreditHours",
    c."minBillingCreditHours",
    c.honors,
    c."collegeId",
    c."departmentId",
    c."subjectId",
    to_tsvector('english'::regconfig, ((((((c.abbr)::text || ' '::text) || regexp_replace((c.abbr)::text, '^([A-Za-z]+)([0-9])'::text, '\1 \2'::text)) || ' '::text) || (c.title)::text))) AS "searchDocument"
   FROM schedule_builder.courses c;

GRANT SELECT ON TABLE "uga"."courses" TO PUBLIC;

COMMENT ON COLUMN "uga"."courses"."searchDocument" IS 'The text the search endpoint matches. The expression must stay identical to schedule_builder.courses_search_idx so the planner can use that index through this view.';
