CREATE TYPE "platform"."oauthRegistrationType" AS ENUM (
  'development',
  'production'
);

GRANT USAGE ON TYPE "platform"."oauthRegistrationType" TO "postgres";
