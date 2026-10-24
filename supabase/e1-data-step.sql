-- Stage E1 data step, appended by the Migration phase after the generated
-- schema migration (the generator can express the new columns, not this).
--
-- oauth-consent Q163. The tier column is retired: status and ownership replace
-- it, and nothing reads it any more. Idempotent: a second run changes nothing.

-- Development clients: Testing, consent on. (Their column defaults already say
-- so; this makes it explicit for rows that existed before the columns.)
update platform."oauthRegistrations"
   set status = 'testing',
       "asksForConsent" = true
 where tier = 'development';

-- Production clients (DogDays, DogPack) are DevDogs apps: no owner (A1 already
-- nulled it; repeated here so the consent check below cannot trip), In
-- production, consent skipped.
update platform."oauthRegistrations"
   set status = 'in_production',
       "userId" = null,
       "asksForConsent" = false
 where tier = 'production';

-- Their details (Q159, Q163). Logos come later, uploaded by `deploy avatars`.
-- Matched on the label the clients were registered under; any production
-- client that matches neither is reported below.
update platform."oauthRegistrations"
   set "homepageUrl" = 'https://dogdays.dev',
       "privacyPolicyUrl" = 'https://devdogsuga.org/legal/privacy'
 where tier = 'production' and label ilike '%dogdays%';

update platform."oauthRegistrations"
   set "homepageUrl" = 'https://dogpack.dev',
       "privacyPolicyUrl" = 'https://devdogsuga.org/legal/privacy'
 where tier = 'production' and label ilike '%dogpack%';

do $$
declare
  unmatched text;
begin
  select string_agg(label || ' (' || "clientId" || ')', ', ')
    into unmatched
    from platform."oauthRegistrations"
   where status = 'in_production' and "homepageUrl" is null;
  if unmatched is not null then
    raise notice 'In production clients without a homepage or privacy policy: %', unmatched;
  end if;
end $$;

-- The new redirect rule (http only on localhost, 127.0.0.1 and [::1]; https
-- everywhere else) against every stored redirect. Raises, naming the client and
-- the address, on the first one that fails, so the migration stops instead of
-- leaving a client the rule would refuse.
select platform.check_oauth_redirects();
