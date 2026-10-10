CREATE TYPE "platform"."auditEventSource" AS ENUM (
  'platform',
  'qr',
  'manual_code',
  'system'
);

GRANT USAGE ON TYPE "platform"."auditEventSource" TO "postgres";
