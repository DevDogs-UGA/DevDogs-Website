CREATE TYPE "platform"."reportStatus" AS ENUM (
  'open',
  'resolved',
  'dismissed'
);

GRANT USAGE ON TYPE "platform"."reportStatus" TO "postgres";
