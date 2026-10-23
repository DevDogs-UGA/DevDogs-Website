/**
 * The homepage's prose, in a plain module because two renderers print it:
 * the sections on `/` and the terminal's twin of that page
 * (`~/terminal/routes/home.ts`). One string each, so `curl devdogsuga.org`
 * and the browser can't describe the club two different ways.
 */

export const HERO_HEADLINE = [
  "Build real",
  "software.",
  "Every week.",
] as const;

export const HERO_BLURB =
  "Learn industry standard tech and compete in hackathons, building features for projects benefitting the UGA community.";

export const MISSION_PARAGRAPHS = [
  "DevDogs is UGA’s large-scale application development club, dedicated to benefiting our community through code.",
  "Every project is free and open source, and designed to teach industry-standard technologies and how to work well together. Whether you’re writing your first line of code or your thousandth, there’s a place for you here.",
] as const;

export const PROJECTS_BLURB =
  "Built by students, for students. Every project is free and open source under BSD-3: students keep copyright and the code is public.";

export const EVENTS_BLURB =
  "Merge Monday every week, special events on Wednesdays, and a social each month. Here’s what’s next.";

export const LEADERSHIP_BLURB =
  "DevDogs is led by a team of UGA students across several disciplines and years.";
