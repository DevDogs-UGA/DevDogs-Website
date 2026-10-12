CREATE VIEW "uga"."partsOfTerm" AS  SELECT p."academicPeriod",
    p.code,
    p.description,
    p."classesBegin",
    p."dropAddEnds",
    p."censusDate",
    p."withdrawalDeadline",
    p."classesEnd",
    p."finalsEnd"
   FROM schedule_builder."partsOfTerm" p;

GRANT SELECT ON TABLE "uga"."partsOfTerm" TO PUBLIC;
