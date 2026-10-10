CREATE TYPE "platform"."contentVisibility" AS ENUM (
  'public',
  'restricted'
);

GRANT USAGE ON TYPE "platform"."contentVisibility" TO "postgres";
