"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import {
  ArrowClockwiseIcon,
  ArrowUpIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react/ssr";
import oauthAction from "~/server/actions/oauth";
import type { getOAuthPageData } from "~/server/loaders/console";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";

const MAX_REDIRECT_URIS = 5;

type OAuthData = Awaited<ReturnType<typeof getOAuthPageData>>;

const SELECT_CLASS =
  "rounded-sm border border-mauve-600 bg-mauve-800 px-3 py-1.5 text-sm text-white transition-colors outline-none focus:border-white disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Production clients: the credentials the DevDogs apps (DogDays, DogPack) sign
 * members in with. Shown only to holders of `canManageOAuthApps`.
 *
 * A production client is approved automatically at consent, so the return
 * address is restricted to a product's own Supabase callback; the server
 * enforces that, and the form says it. Rolling a secret, changing a redirect
 * URI, creating and deleting are all written to the audit log. Deleting needs
 * another live production client to take over, picked in the form.
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

  return (
    <div className="flex flex-col gap-6">
      {productionClients.length === 0 && (
        <p className="text-sm text-mauve-400">
          No production clients yet. Create one for each app that signs members
          in with DevDogs.
        </p>
      )}

      {productionClients.map((client) => {
        const revealedSecret =
          mintedClientId === client.clientId ? clientSecret : null;
        const replacements = productionClients.filter(
          (other) => other.clientId !== client.clientId,
        );

        return (
          <div
            key={client.clientId}
            className="flex flex-col gap-3 rounded-lg border border-mauve-800 p-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-white">{client.label}</span>
              {client.ownerName && (
                <span className="text-xs text-mauve-400">
                  Created by {client.ownerName}
                </span>
              )}
            </div>

            <Input mono copy className="max-w-sm" value={client.clientId} />

            <div className="flex w-full max-w-sm flex-col items-start gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="font-medium text-white">Client Secret</span>
                <p className="pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
                  Shown once. Store it in the app&rsquo;s secrets, never in the
                  repository. Rolling it invalidates the old one at once.
                </p>
                <Input
                  mono
                  copy
                  value={revealedSecret ?? "•••••••••••••••••"}
                  disabled={revealedSecret === null}
                />
              </label>

              <ConfirmDestructiveAction
                action={dispatch}
                title="Roll the client secret"
                description={`Rolling the secret for "${client.label}" invalidates the current one immediately. Members cannot sign in to that app until it has the new secret.`}
                userConfirmText="Roll Secret"
                submitLabel="Roll"
              >
                <input type="hidden" name="intent" value="reset-secret" />
                <input type="hidden" name="clientId" value={client.clientId} />
                <FormButton
                  theme="black"
                  className="self-end text-sm font-medium"
                  disabled={isPending}
                  type="submit"
                >
                  <ArrowClockwiseIcon /> Roll Client Secret
                </FormButton>
              </ConfirmDestructiveAction>
            </div>

            <div className="flex flex-col gap-1.5 pb-1">
              <h4 className="font-medium text-white">Redirect URIs</h4>
              <p className="max-w-prose pb-1.5 text-xs text-balance text-mauve-400 sm:text-left">
                Only the app&rsquo;s own Supabase callback:{" "}
                <Input.Text>
                  https://&lt;project&gt;.supabase.co/auth/v1/callback
                </Input.Text>
                . Up to {MAX_REDIRECT_URIS}, and at least one.
              </p>

              <ul className="flex flex-col gap-3 pb-1.5 empty:hidden">
                {client.redirectUris.map((uri) => (
                  <li key={uri} className="flex items-center gap-1.5 text-sm">
                    <form action={dispatch}>
                      <input type="hidden" name="intent" value="remove-uri" />
                      <input
                        type="hidden"
                        name="clientId"
                        value={client.clientId}
                      />
                      <input type="hidden" name="uri" value={uri} />
                      <button
                        className="rounded-sm p-1.25 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                        type="submit"
                        aria-label={`Remove ${uri}`}
                        disabled={client.redirectUris.length <= 1}
                      >
                        <XIcon />
                      </button>
                    </form>
                    <Input.Text>{uri}</Input.Text>
                  </li>
                ))}
              </ul>

              {client.redirectUris.length < MAX_REDIRECT_URIS && (
                <form action={dispatch} className="flex max-w-sm gap-1.5">
                  <input type="hidden" name="intent" value="add-uri" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <Input
                    mono
                    name="uri"
                    type="url"
                    placeholder="https://dogdays.supabase.co/auth/v1/callback"
                    required
                  />
                  <FormButton
                    theme="black"
                    type="submit"
                    className="text-sm text-nowrap"
                  >
                    <ArrowUpIcon />
                    Add
                  </FormButton>
                </form>
              )}
            </div>

            <ConfirmDestructiveAction
              action={dispatch}
              title="Delete production client"
              description={`Deleting "${client.label}" removes its client ID and secret, and the app using them stops signing members in. The replacement you picked must already be live, and the choice is recorded in the audit log.`}
              userConfirmText="Delete Client"
              submitLabel="Delete"
            >
              <input type="hidden" name="intent" value="revoke-client" />
              <input type="hidden" name="clientId" value={client.clientId} />
              <div className="flex flex-wrap items-center gap-3 border-t border-mauve-800 pt-3">
                <label className="flex items-center gap-2 text-sm text-mauve-300">
                  Replace with
                  <select
                    name="replacementClientId"
                    required
                    defaultValue=""
                    disabled={replacements.length === 0}
                    className={SELECT_CLASS}
                  >
                    <option value="" disabled>
                      {replacements.length === 0
                        ? "No other production client"
                        : "Pick a client"}
                    </option>
                    {replacements.map((other) => (
                      <option key={other.clientId} value={other.clientId}>
                        {other.label}
                      </option>
                    ))}
                  </select>
                </label>
                <FormButton
                  theme="rose"
                  type="submit"
                  disabled={isPending || replacements.length === 0}
                  className="text-sm"
                >
                  Delete
                </FormButton>
              </div>
            </ConfirmDestructiveAction>
          </div>
        );
      })}

      <ProductionCreateForm dispatch={dispatch} isPending={isPending} />
    </div>
  );
}

function ProductionCreateForm({
  dispatch,
  isPending,
}: {
  dispatch: (formData: FormData) => void;
  isPending: boolean;
}) {
  return (
    <form
      action={dispatch}
      className="flex max-w-lg flex-col gap-3 rounded-lg border border-dashed border-mauve-700 p-4"
    >
      <input type="hidden" name="intent" value="create-client" />
      <input type="hidden" name="tier" value="production" />
      <h4 className="font-medium text-white">New production client</h4>
      <label className="flex flex-col gap-1.5 text-sm text-white">
        Label
        <Input
          mono
          name="label"
          placeholder="DogDays"
          required
          maxLength={100}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-white">
        Supabase callback URL
        <Input
          mono
          name="callbackUri"
          type="url"
          placeholder="https://dogdays.supabase.co/auth/v1/callback"
          required
        />
      </label>
      <p className="text-xs text-mauve-400">
        The tier cannot be changed afterwards. The secret is shown once, here,
        right after you create it.
      </p>
      <FormButton
        theme="cyan"
        type="submit"
        disabled={isPending}
        className="self-start text-sm text-nowrap"
      >
        <PlusIcon /> Create production client
      </FormButton>
    </form>
  );
}
