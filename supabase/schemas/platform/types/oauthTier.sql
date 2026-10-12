CREATE TYPE "platform"."oauthTier" AS ENUM (
  'development',
  'production'
);

GRANT USAGE ON TYPE "platform"."oauthTier" TO "postgres";
