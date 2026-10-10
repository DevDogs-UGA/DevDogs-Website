CREATE TYPE "platform"."contentAction" AS ENUM (
  'quarantine',
  'no_action'
);

GRANT USAGE ON TYPE "platform"."contentAction" TO "postgres";
