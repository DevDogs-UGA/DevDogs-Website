CREATE TYPE "platform"."reportReason" AS ENUM (
  'harassment',
  'hate_speech',
  'spam',
  'sexual_content',
  'violence',
  'impersonation',
  'off_topic',
  'other'
);

GRANT USAGE ON TYPE "platform"."reportReason" TO "postgres";
