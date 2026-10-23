-- Stage A1 data step, appended by the Migration phase after the generated
-- schema migration (the generator can express the column change, not this).
--
-- A production client is a DevDogs app (oauth-consent Q161): no owner, so
-- deleting whoever registered it cannot delete it. Idempotent: a second run
-- finds no production row with an owner.
update platform."oauthRegistrations"
   set "userId" = null
 where tier = 'production'
   and "userId" is not null;
