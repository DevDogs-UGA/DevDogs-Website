CREATE VIEW "schedule_builder"."availableTerms" AS  SELECT terms."academicPeriod",
    terms.description
   FROM (schedule_builder.terms
     JOIN schedule_builder.offerings ON ((offerings."academicPeriod" = terms."academicPeriod")))
  WHERE (offerings.cancelled = false)
  GROUP BY terms."academicPeriod", terms.description
  ORDER BY terms."academicPeriod" DESC;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."availableTerms" TO "anon", "authenticated", "postgres", "service_role";
