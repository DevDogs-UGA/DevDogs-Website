"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import OAuthClientSheet from "~/components/Settings/OAuthClientSheet";
import OAuthClientTable from "~/components/Settings/OAuthClientTable";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import EmptyState from "~/ui/empty-state";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/ui/sheet";

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

/**
 * Production clients: the credentials the DevDogs apps (DogDays, DogPack) sign
 * members in with. Shown only to holders of `canManageOAuthApps`.
 *
 * A production client is approved automatically at consent, so the return
 * address is restricted to a product's own Supabase callback; the server
 * enforces that, and the form says it. Rolling a secret, changing a redirect
 * URI, creating and deleting are all written to the audit log. Deleting needs
 * another live production client to take over, picked in the confirm.
 */
export default function OAuthProductionClientsField({
  productionClients,
}: Pick<OAuthData, "productionClients">) {
  const router = useRouter();
  const [{ clientId: mintedClientId, clientSecret }, dispatch, isPending] =
    useActionState(oauthAction, { clientId: null, clientSecret: null });

  const prevIsPendingRef = useRef(false);
  useEffect(() => {
    if (prevIsPendingRef.current && !isPending) router.refresh();
    prevIsPendingRef.current = isPending;
  }, [isPending, router]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const openClient =
    productionClients.find((c) => c.clientId === openId) ?? null;
  // A just-created client has no row until the refresh lands; open its drawer
  // as soon as it does, so its secret is shown once, there.
  const [justMinted, setJustMinted] = useState<string | null>(null);
  if (creating && mintedClientId && mintedClientId !== justMinted) {
    setJustMinted(mintedClientId);
    setOpenId(mintedClientId);
    setCreating(false);
  }

  return (
    <>
      {productionClients.length === 0 ? (
        <EmptyState
          image={false}
          title="No production clients yet"
          description="Create one for each app that signs members in with DevDogs."
        />
      ) : (
        <OAuthClientTable
          clients={productionClients}
          tier="production"
          onEdit={setOpenId}
        />
      )}
      <div style={{ marginTop: 16 }}>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCreating(true)}
        >
          <PlusIcon aria-hidden />
          New production client
        </Button>
      </div>

      <OAuthClientSheet
        client={openClient}
        tier="production"
        replacements={productionClients.filter((c) => c.clientId !== openId)}
        dispatch={dispatch}
        isPending={isPending}
        secret={
          mintedClientId !== null && openClient?.clientId === mintedClientId
            ? clientSecret
            : null
        }
        onClose={() => setOpenId(null)}
      />

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent aria-label="New production client">
          <SheetHeader>
            <div>
              <SheetTitle>New production client</SheetTitle>
              <SheetDescription>
                The tier cannot be changed afterwards.
              </SheetDescription>
            </div>
          </SheetHeader>
          <form action={dispatch} className="contents">
            <input type="hidden" name="intent" value="create-client" />
            <input type="hidden" name="tier" value="production" />
            <SheetBody>
              <label className="field">
                <span className="label">Label</span>
                <Input
                  mono
                  name="label"
                  placeholder="DogDays"
                  required
                  maxLength={100}
                />
              </label>
              <label className="field">
                <span className="label">Supabase callback URL</span>
                <Input
                  mono
                  name="callbackUri"
                  type="url"
                  placeholder="https://dogdays.supabase.co/auth/v1/callback"
                  required
                />
                <span className="help">
                  Only the app&rsquo;s own Supabase callback is accepted.
                </span>
              </label>
              <Callout tone="info">
                The secret is shown once, right after you create the client.
              </Callout>
            </SheetBody>
            <SheetFooter>
              <SheetClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </SheetClose>
              <FormButton theme="cyan" type="submit" disabled={isPending}>
                <PlusIcon aria-hidden />
                Create production client
              </FormButton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
