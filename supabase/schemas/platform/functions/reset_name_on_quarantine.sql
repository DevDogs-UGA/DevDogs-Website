CREATE OR REPLACE FUNCTION platform.reset_name_on_quarantine()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  name_of_record text;
begin
  -- Only on the transition into quarantine. Without this guard every later
  -- update to a frozen profile would re-run the reset, and so would an
  -- un-quarantine.
  if new."quarantinedBy" is null or old."quarantinedBy" is not null then
    return new;
  end if;

  name_of_record := btrim(
    concat_ws(' ', btrim(new."legalFirstName"), btrim(new."legalLastName"))
  );

  if coalesce(name_of_record, '') = '' then
    select btrim(i.identity_data ->> 'name')
      into name_of_record
      from auth.identities i
     where i.user_id = new."userId"
       and i.provider = 'google'
       and lower(i.identity_data ->> 'email') like '%@uga.edu'
     limit 1;
  end if;

  if coalesce(name_of_record, '') <> '' then
    -- "preferredName" is varchar(255); a longer name would abort the
    -- moderator's whole resolution rather than truncate.
    new."preferredName" := left(name_of_record, 255);
  else
    -- Reaches the Postgres log, not the console. The moderator's signal is that
    -- the name they were looking at is still there after they resolved, which
    -- is why this leaves it alone rather than blanking it.
    raise warning
      'platform.profile %: quarantined with no name of record on file; "preferredName" left unchanged',
      new."userId";
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "platform"."reset_name_on_quarantine"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."reset_name_on_quarantine"() FROM PUBLIC;
