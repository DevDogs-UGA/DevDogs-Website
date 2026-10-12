CREATE TYPE "platform"."appKind" AS ENUM (
  'internal',
  'external'
);

GRANT USAGE ON TYPE "platform"."appKind" TO "postgres";
