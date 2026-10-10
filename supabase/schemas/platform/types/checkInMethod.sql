CREATE TYPE "platform"."checkInMethod" AS ENUM (
  'qr',
  'manual_code',
  'import'
);

GRANT USAGE ON TYPE "platform"."checkInMethod" TO "postgres";
