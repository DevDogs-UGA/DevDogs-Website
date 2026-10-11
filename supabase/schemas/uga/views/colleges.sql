CREATE VIEW "uga"."colleges" AS  SELECT c.id,
    c.description
   FROM schedule_builder.colleges c;

GRANT SELECT ON TABLE "uga"."colleges" TO PUBLIC;
