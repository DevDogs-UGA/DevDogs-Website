CREATE TYPE "platform"."oauthDeviceCodeStatus" AS ENUM (
  'pending',
  'approved',
  'denied'
);

GRANT USAGE ON TYPE "platform"."oauthDeviceCodeStatus" TO "postgres";
