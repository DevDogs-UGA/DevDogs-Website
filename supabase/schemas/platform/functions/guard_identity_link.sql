CREATE OR REPLACE FUNCTION platform.guard_identity_link()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  account_email text;
begin
  -- An account's first identity is the sign-up itself.
  if not exists (
    select 1 from "auth"."identities" i where i."user_id" = new."user_id"
  ) then
    return new;
  end if;

  -- Automatic linking: the provider vouches for the account's own address.
  select u."email" into account_email
    from "auth"."users" u where u."id" = new."user_id";
  if account_email is not null
     and lower(new."identity_data" ->> 'email') = lower(account_email)
     and new."identity_data" ->> 'email_verified' = 'true' then
    return new;
  end if;

  -- Manual linking: only one this site started, once.
  delete from "platform"."identityLinkIntents" l
   where l."userId" = new."user_id"
     and l."provider" = new."provider"
     and l."expiresAt" > now();
  if found then
    return new;
  end if;

  raise exception 'identities can only be linked from your DevDogs account page'
    using errcode = '55000';
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."guard_identity_link"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."guard_identity_link"() FROM PUBLIC;
