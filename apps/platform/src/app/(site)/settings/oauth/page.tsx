import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LockIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import Input from "~/components/Input";
import OAuthCredentialsField from "~/components/OAuthCredentialsField";
import OAuthModerationField from "~/components/OAuthModerationField";
import OAuthProductionClientsField from "~/components/OAuthProductionClientsField";
import OAuthTestAccountsField from "~/components/OAuthTestAccountsField";
import SettingsAnchor from "~/components/Settings/SettingsAnchor";
import SettingsShell from "~/components/Settings/SettingsShell";
import { getOAuthPageData } from "~/server/loaders/console";
import { getOAuthModerationData } from "~/server/loaders/oauthModeration";
import { resolveIssuer } from "~/server/oauth/issuer";
import { PageHeading, Panel } from "~/ui/app-shell";
import Badge from "~/ui/badge";
import { Skeleton } from "~/ui/skeleton";

export const metadata: Metadata = {
  title: "OAuth apps | Settings | DevDogs",
  robots: { index: false },
};

const PATH = "/settings/oauth";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function OAuthData({ searchParams }: Props) {
  const [data, moderation, issuer, { add_redirect_uri: prefillRedirectUri }] =
    await Promise.all([
      getOAuthPageData(),
      getOAuthModerationData(),
      // Read from discovery rather than written down: GoTrue stamps the
      // issuer it reports on every ID token, and a provider set to anything
      // else fails its issuer check (TASK-347). It is a `<project>.supabase.co`
      // host, so this follows the platform project wherever it is reached from.
      resolveIssuer().catch(() => null),
      searchParams,
    ]);

  return (
    <>
      <Panel
        id="issuer"
        title="Issuer URL"
        help="Where an OpenID Connect provider (a custom OIDC provider in Supabase, for one) discovers DevDogs sign-in."
      >
        {issuer ? (
          <div className="set-secret">
            <Input mono copy value={issuer} aria-label="Issuer URL" />
          </div>
        ) : (
          <p className="help">
            Couldn&rsquo;t load the issuer right now. Try again in a moment.
          </p>
        )}
        <p className="help" style={{ marginTop: 10, maxWidth: "62ch" }}>
          Read from discovery, not typed in by hand. Copy it exactly: a provider
          set to any other issuer fails its issuer check.
        </p>
      </Panel>

      <Panel
        id="dev-clients"
        title="Development clients"
        help="For testing on your own machine. Redirect URIs can be any http or https address, such as a local Supabase project's callback. Needs a linked GitHub account."
      >
        <OAuthCredentialsField
          {...data}
          prefillRedirectUri={prefillRedirectUri}
        />
      </Panel>

      <Panel
        id="test-accounts"
        title="Test accounts"
        help="Sandboxed identities you can sign in as during the OAuth flow, so you can test without your own account."
      >
        <OAuthTestAccountsField {...data} />
      </Panel>

      <Panel id="moderation" title="Moderation">
        <SettingsAnchor
          id="moderation-clients"
          label="Report and Block"
          description="Sign reports from your app's backend, and receive the decisions moderators make. Reports from a development client land in the sandbox below, never in the moderators' queue."
        >
          <p className="help" style={{ marginBottom: 16, maxWidth: "62ch" }}>
            Sign reports from your app&rsquo;s backend, and receive the
            decisions moderators make. Reports from a development client land in
            the sandbox below, never in the moderators&rsquo; queue.
          </p>
          <OAuthModerationField clients={moderation} />
        </SettingsAnchor>
      </Panel>

      {data.canManageOAuthApps && (
        <Panel
          id="production-clients"
          title="Production clients"
          help="Members don't see this section. These are the credentials a DevDogs app signs its members in with. Approved automatically at sign-in, so only an app's own Supabase callback is accepted. Every change is recorded in the audit log."
        >
          <div style={{ marginBottom: 16 }}>
            <Badge variant="warning">
              <LockIcon aria-hidden />
              Officers only
            </Badge>
          </div>
          <OAuthProductionClientsField {...data} />
        </Panel>
      )}
    </>
  );
}

export default function OAuthPage({ searchParams }: Props) {
  return (
    <SettingsShell current={PATH}>
      <PageHeading
        title="OAuth apps"
        description="Set up an OAuth client to test DevDogs sign-in from your own project."
        actions={
          <Link href="/settings/oauth/new" className="btn secondary">
            <PlusIcon aria-hidden />
            New OAuth client
          </Link>
        }
      />
      {/* The page itself awaits nothing: `searchParams` goes down as the promise
          it already is, because awaiting it here would suspend the shell along
          with the data and put the title behind the same wait. */}
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-[720px]" />}>
        <OAuthData searchParams={searchParams} />
      </Suspense>
    </SettingsShell>
  );
}
