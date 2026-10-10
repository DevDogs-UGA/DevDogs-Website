CREATE TYPE "platform"."membershipDirection" AS ENUM (
  'invite',
  'request'
);

GRANT USAGE ON TYPE "platform"."membershipDirection" TO "postgres";
