CREATE VIEW "uga"."subjects" AS  SELECT s.id,
    s.abbr,
    s.description
   FROM schedule_builder.subjects s;

GRANT SELECT ON TABLE "uga"."subjects" TO PUBLIC;
