CREATE VIEW "uga"."courseDetails" AS  SELECT d."courseId",
    d.description,
    d."gradingSystem",
    d."semesterOffered",
    d.corequisite,
    d."equivalentCourses",
    d.prerequisites,
    d."lastFetched"
   FROM schedule_builder."courseDetails" d;

GRANT SELECT ON TABLE "uga"."courseDetails" TO PUBLIC;
