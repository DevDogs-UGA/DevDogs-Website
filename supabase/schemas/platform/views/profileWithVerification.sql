CREATE VIEW "platform"."profileWithVerification" WITH (security_invoker=true) AS  SELECT "userId",
    ((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0)) AS "hasPronouns",
    (("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL)) AS "hasGraduationDate",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AS "hasGithub",
    (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text)))) AS "hasDiscord",
    (("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName"))))) AS "nameMatchesInvolvement",
    (((pronouns IS NOT NULL) AND (array_length(pronouns, 1) > 0) AND ("graduationSemester" IS NOT NULL) AND ("graduationYear" IS NOT NULL) AND ("involvementFirstName" IS NOT NULL) AND (lower(TRIM(BOTH FROM "preferredName")) = lower(((TRIM(BOTH FROM "involvementFirstName") || ' '::text) || TRIM(BOTH FROM "involvementLastName")))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'github'::text)))) AND (EXISTS ( SELECT 1
           FROM auth.identities i
          WHERE ((i.user_id = p."userId") AND (i.provider = 'discord'::text))))) OR (EXISTS ( SELECT 1
           FROM (platform."userRoles" ur
             JOIN platform.roles r ON ((r.id = ur."roleId")))
          WHERE ((ur."userId" = p."userId") AND r."isLeadership")))) AS verified
   FROM platform.profile p;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "platform"."profileWithVerification" TO "anon", "authenticated", "postgres", "service_role";
