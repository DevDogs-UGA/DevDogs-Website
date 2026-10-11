CREATE VIEW "uga"."instructors" AS  SELECT i.id,
    i."firstName",
    i."lastName"
   FROM schedule_builder.instructors i;

GRANT SELECT ON TABLE "uga"."instructors" TO PUBLIC;
