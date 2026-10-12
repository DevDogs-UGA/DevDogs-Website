CREATE VIEW "uga"."offerings" AS  SELECT o.crn,
    o."academicPeriod",
    o."partOfTerm",
    o."courseId",
    o."instructorId",
    o."campusId",
    o."scheduleTypeId",
    o."maximumEnrollment",
    o."actualEnrollment",
    o."seatsAvailable",
    o.cancelled,
    o."lastSeenAt"
   FROM schedule_builder.offerings o;

GRANT SELECT ON TABLE "uga"."offerings" TO PUBLIC;
