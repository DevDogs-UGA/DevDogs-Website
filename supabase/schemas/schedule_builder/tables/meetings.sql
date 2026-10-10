CREATE TABLE "schedule_builder"."meetings" (
  "id"             integer                NOT NULL DEFAULT nextval('schedule_builder.meetings_id_seq'::regclass),
  "monday"         boolean                NOT NULL DEFAULT false,
  "tuesday"        boolean                NOT NULL DEFAULT false,
  "wednesday"      boolean                NOT NULL DEFAULT false,
  "thursday"       boolean                NOT NULL DEFAULT false,
  "friday"         boolean                NOT NULL DEFAULT false,
  "saturday"       boolean                NOT NULL DEFAULT false,
  "sunday"         boolean                NOT NULL DEFAULT false,
  "startDate"      date,
  "endDate"        date,
  "startTime"      time without time zone,
  "endTime"        time without time zone,
  "buildingId"     integer,
  "room"           character varying,
  "academicPeriod" integer                NOT NULL,
  "offeringCrn"    integer                NOT NULL,
  CONSTRAINT "meetings_buildingId_buildings_id_fkey" FOREIGN KEY ("buildingId") REFERENCES schedule_builder.buildings(id),
  CONSTRAINT "meetings_pkey" PRIMARY KEY (id),
  CONSTRAINT "meetings_academicPeriod_offeringCrn_fkey" FOREIGN KEY ("academicPeriod", "offeringCrn") REFERENCES schedule_builder.offerings("academicPeriod", crn)
);

ALTER TABLE "schedule_builder"."meetings"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "schedule_builder"."meetings_id_seq" OWNED BY "schedule_builder"."meetings"."id";

ALTER TABLE "schedule_builder"."meetings"
  ADD COLUMN "locationStatus" schedule_builder."locationStatus" NOT NULL DEFAULT 'TBA'::schedule_builder."locationStatus";

CREATE INDEX "meetings_academicPeriod_offeringCrn_index" ON schedule_builder.meetings USING btree ("academicPeriod", "offeringCrn");

CREATE POLICY "public_read" ON "schedule_builder"."meetings"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "schedule_builder"."meetings" TO "anon", "authenticated", "postgres", "service_role";
