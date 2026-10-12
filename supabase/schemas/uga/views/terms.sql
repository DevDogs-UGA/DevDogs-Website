CREATE VIEW "uga"."terms" AS  SELECT t."academicPeriod",
    t.description,
    (EXISTS ( SELECT 1
           FROM schedule_builder.offerings o
          WHERE ((o."academicPeriod" = t."academicPeriod") AND (o.cancelled = false)))) AS available
   FROM schedule_builder.terms t;

GRANT SELECT ON TABLE "uga"."terms" TO PUBLIC;

COMMENT ON VIEW "uga"."terms" IS 'Every term, with whether any section is still offered. The catalog lists only available terms.';
