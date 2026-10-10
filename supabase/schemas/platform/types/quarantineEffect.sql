CREATE TYPE "platform"."quarantineEffect" AS ENUM (
  'hide',
  'freeze'
);

GRANT USAGE ON TYPE "platform"."quarantineEffect" TO "postgres";
