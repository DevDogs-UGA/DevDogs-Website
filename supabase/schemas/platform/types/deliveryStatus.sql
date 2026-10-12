CREATE TYPE "platform"."deliveryStatus" AS ENUM (
  'pending',
  'delivered',
  'failed'
);

GRANT USAGE ON TYPE "platform"."deliveryStatus" TO "postgres";
