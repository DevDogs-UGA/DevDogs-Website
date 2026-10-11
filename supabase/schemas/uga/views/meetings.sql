CREATE VIEW "uga"."meetings" AS  SELECT m.id,
    m."academicPeriod",
    m."offeringCrn",
    m.monday,
    m.tuesday,
    m.wednesday,
    m.thursday,
    m.friday,
    m.saturday,
    m.sunday,
    m."startDate",
    m."endDate",
    m."startTime",
    m."endTime",
    m."buildingId",
    m.room,
    m."locationStatus"
   FROM schedule_builder.meetings m;

GRANT SELECT ON TABLE "uga"."meetings" TO PUBLIC;
