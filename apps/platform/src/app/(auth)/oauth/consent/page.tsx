import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { TestAccount } from "~/server/actions/testAccounts";
import { expectSession, expectUserWith } from "~/server/auth";
import ConsentForm from "~/components/ConsentForm";
import { testAccountName } from "~/lib/testAccountName";
import { approveAuthorization } from "~/server/oauth/approveAuthorization";
import { findConsentTarget } from "~/server/oauth/consentTarget";
import { decideConsent } from "~/server/oauth/tier";
import { createSupabaseServerClient } from "~/supabase/server";

/**
 * A step inside an authorization flow, reachable only with a live
 * `authorization_id`. Without one it 404s, and with a stale one it 404s too.
 * Nothing here is the same twice, let alone worth indexing, and the query
 * string it needs is a credential-adjacent identifier that should not end up in
 * a search result.
 */
export const metadata: Metadata = {
  title: "Authorize | DevDogs",
  robots: { index: false },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function ConsentPage({ searchParams }: Props) {
  const authorizationId = (await searchParams).authorization_id;

  if (!authorizationId) {
    notFound();
  }

  // The client's registration decides everything, and it is read before the
  // visitor is asked to sign in: a client nobody registered, or an
  // authorization that has gone, is a 404 for everyone.
  const target = await findConsentTarget(authorizationId);

  if (!target) {
    notFound();
  }

  const userId = await expectSession().catch(() => {
    const callbackPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/auth?callbackPath=${encodeURIComponent(callbackPath)}`);
  });

  // Decided on the server before anything renders. A production client is
  // approved here, for whoever signed in, when it returns to a Supabase
  // callback; a development client shows its owner the test-account form;
  // everything else is the same 404 as a stale id. The access token hook
  // (migration 57) downgrades every token this authorization produces to
  // `oauth_identity`, because GoTrue's own consent endpoint does not go
  // through this page.
  const decision = decideConsent({
    tier: target.tier,
    redirectUri: target.redirectUri,
    ownerUserId: target.ownerUserId,
    userId,
  });

  if (decision === "not-found") {
    notFound();
  }

  if (decision === "auto-approve") {
    let destination: string;
    try {
      destination = await approveAuthorization(
        await createSupabaseServerClient(),
        authorizationId,
      );
    } catch {
      // An expired or already-used authorization: same answer as a stale id.
      notFound();
    }
    redirect(destination);
  }

  const user = await expectUserWith({
    testAccounts: {
      columns: {
        createdAt: true,
      },
      with: {
        user: {
          columns: {
            id: true,
            email: true,
            createdAt: true,
            rawUserMetaData: true,
          },
        },
      },
    },
  }).catch(() => notFound());

  const testAccounts = user.testAccounts.map(
    ({ user, createdAt }) =>
      ({
        userId: user.id,
        displayName: testAccountName(user.rawUserMetaData),
        createdAt: createdAt.toISOString(),
      }) satisfies TestAccount,
  );

  // The centring and the full-viewport ground come from `(auth)/layout.tsx`.
  // All that is left here is the card the decision sits on.
  return (
    <div className="w-full max-w-sm rounded-xl border-2 border-mauve-800 bg-mauve-900 p-8 shadow-lg shadow-black/30">
      <ConsentForm
        authorizationId={authorizationId}
        testAccounts={testAccounts}
      />
    </div>
  );
}
