CREATE TYPE "platform"."subjectAction" AS ENUM (
  'warn',
  'suspend',
  'ban',
  'no_action'
);

GRANT USAGE ON TYPE "platform"."subjectAction" TO "postgres";
