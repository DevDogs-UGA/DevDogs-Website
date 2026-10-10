CREATE TYPE "platform"."membershipRequestStatus" AS ENUM (
  'pending',
  'accepted',
  'declined',
  'withdrawn',
  'expired'
);

GRANT USAGE ON TYPE "platform"."membershipRequestStatus" TO "postgres";
