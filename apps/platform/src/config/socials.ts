import type * as icons from "./icons";

/**
 * The club's social channels. Each is linked as a short path on our own
 * domain (`devdogsuga.org/discord`), which `next.config.ts` redirects to the
 * profile. A channel that moves changes here, not in every printed flyer and
 * bio that links it.
 *
 * Its own module, free of asset imports, so `next.config.ts` can read it.
 * `url` is the profile itself, for redirects and for the Organization
 * JSON-LD's `sameAs`, which wants the page that identifies the club rather
 * than our redirect to it.
 *
 * `/discord` and `/github` share a first segment with the Discord
 * interaction and GitHub App webhook routes (`/discord/interactions`,
 * `/github/webhook`); a redirect's source matches only its exact path, so
 * the two never meet.
 */
export const SOCIALS: {
  label: string;
  path: `/${string}`;
  url: string;
  icon: keyof typeof icons;
}[] = [
  {
    label: "Discord",
    path: "/discord",
    url: "https://discord.gg/BdDdkNQhqp",
    icon: "DiscordLogoIcon",
  },
  {
    label: "Instagram",
    path: "/instagram",
    url: "https://instagram.com/DevDogsUGA",
    icon: "InstagramLogoIcon",
  },
  {
    label: "LinkedIn",
    path: "/linkedin",
    url: "https://linkedin.com/company/DevDogsUGA",
    icon: "LinkedinLogoIcon",
  },
  {
    label: "GitHub",
    path: "/github",
    url: "https://github.com/DevDogsUGA",
    icon: "GithubLogoIcon",
  },
];
