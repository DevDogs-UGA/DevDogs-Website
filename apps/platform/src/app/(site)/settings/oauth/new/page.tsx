import type { Metadata } from "next";
import { Suspense } from "react";
import OAuthNewClient from "~/components/Settings/OAuthNewClient";
import SettingsShell from "~/components/Settings/SettingsShell";
import { getOAuthPageData } from "~/server/loaders/console";
import { resolveIssuer } from "~/server/oauth/issuer";
import { PageHeading } from "~/ui/app-shell";
import Callout from "~/ui/callout";
import { Skeleton } from "~/ui/skeleton";
import Link from "next/link";

export const metadata: Metadata = {
  title: "New OAuth client | Settings | DevDogs",
  robots: { index: false },
};

const PATH = "/settings/oauth/new";

/** What a development client starts with; the server's `DEFAULT_REDIRECT_URIS`. */
const DEFAULT_REDIRECT_URIS = ["http://localhost:3000/auth"];

async function NewClient() {
  const [data, issuer] = await Promise.all([
    getOAuthPageData(),
    // Read from discovery rather than written down: see settings/oauth/page.
    resolveIssuer().catch(() => null),
  ]);

  if (!data.hasGithub) {
    return (
      <Callout tone="warning" title="Link GitHub to create clients">
        Development clients need a linked GitHub account.{" "}
        <Link href="/settings/accounts#github" className="textlink">
          Link GitHub account
        </Link>
      </Callout>
    );
  }

  return (
    <OAuthNewClient
      issuer={issuer}
      defaultRedirectUris={DEFAULT_REDIRECT_URIS}
    />
  );
}

export default function NewOAuthClientPage() {
  return (
    <SettingsShell current={PATH}>
      <PageHeading
        crumbs={[
          { label: "OAuth apps", href: "/settings/oauth" },
          { label: "New client" },
        ]}
        title="New OAuth client"
        description="Two steps: describe the client, then copy its secret. The secret is shown once."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-[720px]" />}>
        <NewClient />
      </Suspense>
    </SettingsShell>
  );
}
