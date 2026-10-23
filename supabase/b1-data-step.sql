-- B1 (TASK-529) data step: meetings.kind -> meetings.category.
--
-- The Migration phase appends this to the migration generated from the
-- schema edit (it adds platform.meetings."series" and "category"). Idempotent:
-- it only fills rows whose category is still null, so a re-run is a no-op, and
-- reconcile overwrites every row from config on the next deploy anyway. This
-- exists so the events pages are never category-less between the migration and
-- the first reconcile.
--
-- "kind" is NOT dropped here: it is deprecated (nothing reads it) and goes in
-- a later destructive change, one deploy after the last reader.

update "platform"."meetings"
set "category" = case
    when "kind" = 'Build Session' then 'build'
    when "kind" = 'Study Session' then 'study'
    when "kind" = 'Interest Meeting' then 'info'
    when "kind" = 'Social' then 'social'
    when "kind" = 'Demo Night' then 'milestone'
    -- Kickoff and Cold Start were kind-less one-offs; they are milestones.
    when "nameOverride" in ('Cold Start', 'Georgia 311 Kickoff') then 'milestone'
    -- Any other night with no kind was a workshop night.
    else 'workshop'
  end
where "category" is null;
