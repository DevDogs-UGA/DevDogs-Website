"use client";

import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import { usePathname, useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import Input from "~/components/Input";
import OAuthClientSheet, {
  MAX_REDIRECT_URIS,
} from "~/components/Settings/OAuthClientSheet";
import OAuthClientTable from "~/components/Settings/OAuthClientTable";
import EmptyState from "~/ui/empty-state";

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

export default function OAuthCredentialsField({
  clients,
  hasGithub,
  prefillRedirectUri,
}: OAuthData & { prefillRedirectUri?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [{ clientId: mintedClientId, clientSecret }, dispatch, isPending] =
    useActionState(oauthAction, { clientId: null, clientSecret: null });

  const prevIsPendingRef = useRef(false);
  useEffect(() => {
    if (prevIsPendingRef.current && !isPending) router.refresh();
    prevIsPendingRef.current = isPending;
  }, [isPending, router]);

  const [prefillOpen, setPrefillOpen] = useState(false);

  useEffect(() => {
    // Intentional: open the prefill UI when a redirect URI arrives via props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (prefillRedirectUri) setPrefillOpen(true);
  }, [prefillRedirectUri]);

  // The prefill link (from `devtools oauth`'s legacy manual flow) names a
  // redirect URI but no client -- fine when there is exactly one client to
  // guess, which is the common case right after the gate mints the first
  // one. With several, there is nothing to disambiguate against, so the
  // dialog says so instead of picking one.
  const soleClient = clients.length === 1 ? clients[0] : null;
  const atUriLimit =
    (soleClient?.redirectUris.length ?? 0) >= MAX_REDIRECT_URIS;

  const prefillStatus = !prefillRedirectUri
    ? null
    : clients.length === 0
      ? "no-client"
      : !soleClient
        ? "multiple-clients"
        : soleClient.redirectUris.includes(prefillRedirectUri)
          ? "already-added"
          : atUriLimit
            ? "at-limit"
            : "ready";

  const handlePrefillConfirm = useCallback(() => {
    if (!prefillRedirectUri || !soleClient) return;
    const fd = new FormData();
    fd.set("intent", "add-uri");
    fd.set("clientId", soleClient.clientId);
    fd.set("uri", prefillRedirectUri);
    dispatch(fd);
    setPrefillOpen(false);
  }, [prefillRedirectUri, soleClient, dispatch]);

  function handlePrefillOpenChange(open: boolean) {
    setPrefillOpen(open);
    if (!open) router.replace(pathname, { scroll: false });
  }

  const [openId, setOpenId] = useState<string | null>(null);
  const openClient = clients.find((c) => c.clientId === openId) ?? null;
  const revealed =
    mintedClientId !== null && openClient?.clientId === mintedClientId
      ? clientSecret
      : null;

  const prefill = (title: string, body: ReactNode, confirm?: ReactNode) => (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{body}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        {confirm ?? <AlertDialogCancel>Got it</AlertDialogCancel>}
      </AlertDialogFooter>
    </>
  );

  return (
    <>
      <AlertDialog open={prefillOpen} onOpenChange={handlePrefillOpenChange}>
        <AlertDialogContent>
          {prefillStatus === "no-client" &&
            prefill(
              "No OAuth client yet",
              "Create an OAuth client first, then revisit this page to register your redirect URI.",
            )}
          {prefillStatus === "multiple-clients" &&
            prefill(
              "Pick a client",
              <>
                You have more than one OAuth client. Add{" "}
                <Input.Text>{prefillRedirectUri}</Input.Text> as a redirect URI
                on the right one below.
              </>,
            )}
          {prefillStatus === "already-added" &&
            prefill(
              "Already registered",
              <>
                <Input.Text>{prefillRedirectUri}</Input.Text> is already in your
                redirect URIs. You&rsquo;re all set.
              </>,
            )}
          {prefillStatus === "at-limit" &&
            prefill(
              "Redirect URI limit reached",
              <>
                This client already has {MAX_REDIRECT_URIS} redirect URIs.
                Remove one before adding{" "}
                <Input.Text>{prefillRedirectUri}</Input.Text>.
              </>,
            )}
          {prefillStatus === "ready" &&
            prefill(
              "Register redirect URI?",
              <>
                Add <Input.Text>{prefillRedirectUri}</Input.Text> as a redirect
                URI for your DevDogs OAuth client?
              </>,
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handlePrefillConfirm}
                  disabled={isPending}
                >
                  Add
                </AlertDialogAction>
              </>,
            )}
        </AlertDialogContent>
      </AlertDialog>

      {clients.length === 0 ? (
        <EmptyState
          image={false}
          title="No development clients yet"
          description={
            hasGithub
              ? "Create one to get a client ID and secret for testing DevDogs sign-in locally."
              : "Development clients need a linked GitHub account. Link one, then come back here."
          }
        >
          {hasGithub ? (
            <Link href="/settings/oauth/new" className="btn secondary">
              <PlusIcon aria-hidden />
              Create your first client
            </Link>
          ) : (
            <Link href="/settings/accounts#github" className="btn secondary">
              Link GitHub account
            </Link>
          )}
        </EmptyState>
      ) : (
        <OAuthClientTable
          clients={clients}
          tier="development"
          onEdit={setOpenId}
        />
      )}

      <OAuthClientSheet
        client={openClient}
        tier="development"
        dispatch={dispatch}
        isPending={isPending}
        secret={revealed}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
