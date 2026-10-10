CREATE TYPE "platform"."filerAction" AS ENUM (
  'warn',
  'suspend',
  'no_action'
);

GRANT USAGE ON TYPE "platform"."filerAction" TO "postgres";
