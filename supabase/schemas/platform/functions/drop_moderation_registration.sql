CREATE OR REPLACE FUNCTION platform.drop_moderation_registration()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from "platform"."moderationClients" m where m."clientId" = new."id";
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."drop_moderation_registration"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."drop_moderation_registration"() FROM PUBLIC;
