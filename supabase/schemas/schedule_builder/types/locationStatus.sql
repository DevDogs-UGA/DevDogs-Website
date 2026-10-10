CREATE TYPE "schedule_builder"."locationStatus" AS ENUM (
  'TBA',
  'NCRR',
  'RESERVED'
);

GRANT USAGE ON TYPE "schedule_builder"."locationStatus" TO "postgres";
