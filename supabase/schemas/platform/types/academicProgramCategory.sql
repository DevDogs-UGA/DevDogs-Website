CREATE TYPE "platform"."academicProgramCategory" AS ENUM (
  'undergraduate_major',
  'graduate_major',
  'undergraduate_minor',
  'undergraduate_certificate',
  'graduate_certificate',
  'professional_program'
);

GRANT USAGE ON TYPE "platform"."academicProgramCategory" TO "postgres";
