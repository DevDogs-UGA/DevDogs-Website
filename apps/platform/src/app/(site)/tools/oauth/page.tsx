import { Suspense } from "react";
import Field from "~/ui/field";
import OAuthCredentialsField from "~/components/OAuthCredentialsField";
import OAuthGateDialog from "~/components/OAuthGateDialog";
import OAuthProductionClientsField from "~/components/OAuthProductionClientsField";
import Input from "~/components/Input";
import OAuthTestAccountsField from "~/components/OAuthTestAccountsField";
import PageShell from "~/components/PageShell";
import { CardSkeleton } from "~/components/Skeletons";
import { ConsoleCard } from "~/ui/card";
import { getOAuthPageData } from "~/server/loaders/console";
import { resolveIssuer } from "~/server/oauth/issuer";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function OAuthData({ searchParams }: Props) {
  const [data, issuer, { add_redirect_uri: prefillRedirectUri }] =
    await Promise.all([
      getOAuthPageData(),
      // Read from discovery rather than written down: GoTrue stamps the
      // issuer it reports on every ID token, and a provider set to anything
      // else fails its issuer check (TASK-347). It is a `<project>.supabase.co`
      // host, so this follows the platform project wherever it is reached from.
      resolveIssuer().catch(() => null),
      searchParams,
    ]);

  return (
    <>
      <OAuthGateDialog
        key={data.hasAnyClient ? "enabled" : "disabled"}
        hasAnyClient={data.hasAnyClient}
        hasGithub={data.hasGithub}
      />

      <ConsoleCard.Root id="credentials">
        <ConsoleCard.Header title="Credentials" />
        <ConsoleCard.Content>
          <Field
            id="issuer"
            label="Issuer URL"
            description="Where an OpenID Connect provider (a custom OIDC provider in Supabase, for one) discovers DevDogs sign-in."
          >
            {issuer ? (
              <Input mono copy className="max-w-sm" value={issuer} />
            ) : (
              <p className="text-sm text-mauve-400">
                Couldn&rsquo;t load the issuer right now. Try again in a moment.
              </p>
            )}
          </Field>

          <Field
            id="client-credentials"
            label="Client ID"
            description="Copy these into your project's environment variables to enable DevDogs sign-in locally."
          >
            <OAuthCredentialsField
              {...data}
              prefillRedirectUri={prefillRedirectUri}
            />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>

      {data.canManageOAuthApps && (
        <ConsoleCard.Root id="production-clients">
          <ConsoleCard.Header title="Production clients" />
          <ConsoleCard.Content>
            <Field
              id="production-client-list"
              label="First-party clients"
              description="The credentials a DevDogs app signs its members in with. Approved automatically at sign-in, so only an app's own Supabase callback is accepted. Every change here is recorded in the audit log."
            >
              <OAuthProductionClientsField {...data} />
            </Field>
          </ConsoleCard.Content>
        </ConsoleCard.Root>
      )}

      <ConsoleCard.Root id="test-accounts">
        <ConsoleCard.Header title="Test Accounts" />
        <ConsoleCard.Content>
          <Field
            id="test-accounts-list"
            label="Test Accounts"
            description="Sandboxed identities you can sign in as during the OAuth flow, without using your real DevDogs account."
          >
            <OAuthTestAccountsField {...data} />
          </Field>
        </ConsoleCard.Content>
      </ConsoleCard.Root>
    </>
  );
}

export default function OAuthPage({ searchParams }: Props) {
  return (
    <PageShell
      accent="cyan"
      title="OAuth"
      description="Set up a local OAuth client to test DevDogs sign-in from your own project."
    >
      {/* The page itself awaits nothing: `searchParams` goes down as the promise
          it already is, because awaiting it here would suspend the shell along
          with the data and put the title behind the same wait. */}
      <Suspense
        fallback={
          <>
            <CardSkeleton rows={1} />
            <CardSkeleton rows={2} />
          </>
        }
      >
        <OAuthData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
