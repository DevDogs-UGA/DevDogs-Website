CREATE TYPE "platform"."teamRole" AS ENUM (
  'lead',
  'member'
);

GRANT USAGE ON TYPE "platform"."teamRole" TO "postgres";
