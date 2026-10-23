import type { Metadata } from "next";

import PartnersPage from "~/components/Partners/PartnersPage";

/**
 * Static copy; changes only with a deploy.
 */
export const revalidate = false;

/**
 * Title and description follow the same rule as `/community`: the description
 * is the navbar entry's, from `config/nav.ts`.
 */
export const metadata: Metadata = {
  title: "Partners | DevDogs",
  description: "Organizations and sponsors that partner with DevDogs.",
};

/**
 * `/partners`: the pitch, the tiers, how to start and the contact. All copy
 * lives in `components/Partners/copy.ts`; there is no data and no request read.
 */
export default function Partners() {
  return <PartnersPage />;
}
