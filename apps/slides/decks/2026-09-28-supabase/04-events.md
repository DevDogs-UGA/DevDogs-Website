---
layout: events
accent: amber
chip: UPCOMING
---

# Upcoming meetings

<UpcomingStack />

<!--
Same "stack of upcoming nights" component as the platform's own homepage
(apps/platform/src/components/EventsSection/UpcomingMeetings.tsx), ported to
this theme as <UpcomingStack> (theme/components/UpcomingStack.vue +
NextMeetingStrip.vue) instead of hand-typed markdown, which is what used to
render broken here.

Data comes from @devdogsuga/events (getClubConfig()) via the
`virtual:dd-meetings` Vite plugin (theme/vite/meetings.ts), filtered to
meetings after this workshop starts (2026-09-28 18:00 America/New_York),
cancelled meetings and "Production test" fixtures dropped, soonest first.
Only two meetings exist in the committed data past tonight's cutoff, so the
stack shows both rather than the ~3 it's built for -- re-run closer to the
workshop in case more have been added, no slide edit needed either way.
-->

<!-- Presenter notes: Two real meetings ahead -- this Wednesday's build
session, and next Monday's career-fair-readiness workshop, which lines up
with tonight's competition deadline (Oct 5, when the meeting starts). -->
