CREATE TYPE "platform"."graduationSemester" AS ENUM (
  'spring',
  'summer',
  'fall'
);

GRANT USAGE ON TYPE "platform"."graduationSemester" TO "postgres";
