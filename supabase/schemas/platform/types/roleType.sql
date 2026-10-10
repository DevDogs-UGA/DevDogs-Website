CREATE TYPE "platform"."roleType" AS ENUM (
  'default',
  'custom'
);

GRANT USAGE ON TYPE "platform"."roleType" TO "postgres";
