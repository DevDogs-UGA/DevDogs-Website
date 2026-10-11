CREATE VIEW "uga"."departments" AS  SELECT d.id,
    d.description,
    d."collegeId"
   FROM schedule_builder.departments d;

GRANT SELECT ON TABLE "uga"."departments" TO PUBLIC;
