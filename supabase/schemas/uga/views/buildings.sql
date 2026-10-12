CREATE VIEW "uga"."buildings" AS  SELECT b.id,
    b.description,
    b.address,
    b.latitude,
    b.longitude
   FROM schedule_builder.buildings b;

GRANT SELECT ON TABLE "uga"."buildings" TO PUBLIC;
