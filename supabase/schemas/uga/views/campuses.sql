CREATE VIEW "uga"."campuses" AS  SELECT c.id,
    c.abbr,
    c.description
   FROM schedule_builder.campuses c;

GRANT SELECT ON TABLE "uga"."campuses" TO PUBLIC;
