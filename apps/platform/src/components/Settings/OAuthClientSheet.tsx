"use client";

import { useState } from "react";
import {
  ArrowsClockwiseIcon,
  CheckIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import FormButton from "~/components/FormButton";
import Input from "~/components/Input";
import Select from "~/components/Select";
import type { OAuthClientSummary } from "~/server/loaders/console";
import { Button } from "~/ui/button";
import Badge from "~/ui/badge";
import Callout from "~/ui/callout";
import ConfirmDestructiveAction from "~/ui/confirm-destructive-action";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSection,
  SheetTitle,
} from "~/ui/sheet";

export const MAX_REDIRECT_URIS = 5;

export type OAuthTier = "development" | "production";

interface Props {
  client: OAuthClientSummary | null;
  tier: OAuthTier;
  /** The other production clients, one of which takes over if this is deleted. */
  replacements?: OAuthClientSummary[];
  dispatch: (formData: FormData) => void;
  isPending: boolean;
  /** The secret just minted or rolled for this client, or null. Shown once. */
  secret: string | null;
  onClose: () => void;
}

/**
 * The right-hand drawer where one OAuth client is edited (settings-oauth.html).
 * Redirect URIs, regenerate and revoke are immediate server actions, each of
 * the destructive ones behind a named confirm. A fresh secret is shown once and
 * the drawer cannot be dismissed until the member presses Done.
 */
export default function OAuthClientSheet({
  client,
  tier,
  replacements = [],
  dispatch,
  isPending,
  secret,
  onClose,
}: Props) {
  // The secret the member has already acknowledged, so Done hides it for good.
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  const revealed = secret !== null && secret !== acknowledged ? secret : null;
  const production = tier === "production";

  return (
    <Sheet
      open={client !== null}
      onOpenChange={(open) => {
        if (!open && revealed === null) onClose();
      }}
    >
      <SheetContent
        showCloseButton={revealed === null}
        onEscapeKeyDown={(e) => revealed !== null && e.preventDefault()}
        onInteractOutside={(e) => revealed !== null && e.preventDefault()}
        aria-label="Edit OAuth client"
      >
        {client && (
          <>
            <SheetHeader>
              <div>
                <SheetTitle>Edit OAuth client</SheetTitle>
                <SheetDescription asChild>
                  <div
                    className="row"
                    style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}
                  >
                    <span className="small muted">{client.label}</span>
                    <Badge variant={production ? "warning" : "info"}>
                      {production ? "Production" : "Development"}
                    </Badge>
                  </div>
                </SheetDescription>
              </div>
            </SheetHeader>

            <SheetBody>
              <div className="field">
                <span className="label">Client name</span>
                <Input value={client.label} readOnly aria-label="Client name" />
                {client.ownerName && (
                  <span className="help">Created by {client.ownerName}</span>
                )}
              </div>

              <div className="field">
                <label className="label" htmlFor="oauth-sheet-cid">
                  Client ID
                </label>
                <Input id="oauth-sheet-cid" mono copy value={client.clientId} />
                <span className="help">
                  Read-only. Safe to put in your project&rsquo;s environment
                  variables.
                </span>
              </div>

              {revealed !== null ? (
                <div className="field">
                  <label className="label" htmlFor="oauth-sheet-secret">
                    New client secret
                  </label>
                  <Input id="oauth-sheet-secret" mono copy value={revealed} />
                  <Callout
                    tone="warning"
                    alert
                    title="You won't see this again."
                  >
                    Copy it now. The close button is off until you press Done.
                  </Callout>
                </div>
              ) : (
                <div className="field">
                  <span className="label">Client secret</span>
                  <p className="small muted" style={{ margin: 0 }}>
                    Hidden. Secrets can&rsquo;t be read after they&rsquo;re
                    generated. To get a new one, use Regenerate under Danger
                    zone below.
                  </p>
                </div>
              )}

              <SheetSection>Access</SheetSection>
              <div className="field">
                <span className="label">
                  {production ? "Callback URLs" : "Redirect URIs"}{" "}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    · {client.redirectUris.length} of {MAX_REDIRECT_URIS}
                  </span>
                </span>
                <ul>
                  {client.redirectUris.map((uri) => (
                    <li key={uri} className="set-uri">
                      <Input mono value={uri} readOnly aria-label={uri} />
                      <form action={dispatch} className="contents">
                        <input type="hidden" name="intent" value="remove-uri" />
                        <input
                          type="hidden"
                          name="clientId"
                          value={client.clientId}
                        />
                        <input type="hidden" name="uri" value={uri} />
                        <button
                          type="submit"
                          className="iconbtn"
                          aria-label={`Remove ${uri}`}
                          disabled={
                            isPending ||
                            (production && client.redirectUris.length <= 1)
                          }
                        >
                          <TrashIcon aria-hidden />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                {client.redirectUris.length < MAX_REDIRECT_URIS && (
                  <form action={dispatch} className="set-uri">
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
                      aria-label="New redirect URI"
                      placeholder={
                        production
                          ? "https://dogdays.supabase.co/auth/v1/callback"
                          : "http://127.0.0.1:54321/auth/v1/callback"
                      }
                      required
                    />
                    <FormButton theme="black" type="submit" size="sm">
                      <PlusIcon aria-hidden />
                      Add URI
                    </FormButton>
                  </form>
                )}
                <span className="help">
                  {production
                    ? "Only the app's own Supabase callback: https://<project>.supabase.co/auth/v1/callback. At least one."
                    : "Any http or https address."}
                </span>
              </div>

              <SheetSection>
                <span style={{ color: "var(--bad)" }}>Danger zone</span>
              </SheetSection>
              <p className="help" style={{ margin: "0 0 12px" }}>
                These act right away, after you confirm. Close doesn&rsquo;t
                undo them.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <ConfirmDestructiveAction
                  action={dispatch}
                  title={`Regenerate secret for ${client.label}?`}
                  description={
                    production
                      ? "The current secret stops working immediately. Members cannot sign in to that app until it has the new secret. The new secret is shown once."
                      : "The current secret stops working immediately. Any project still using it can't sign members in until you paste the new one. The new secret is shown once."
                  }
                  submitLabel="Regenerate secret"
                >
                  <input type="hidden" name="intent" value="reset-secret" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  <FormButton
                    theme="rose"
                    variant="destructive"
                    size="sm"
                    type="submit"
                    disabled={isPending}
                  >
                    <ArrowsClockwiseIcon aria-hidden />
                    Regenerate secret…
                  </FormButton>
                </ConfirmDestructiveAction>

                <ConfirmDestructiveAction
                  action={dispatch}
                  title={
                    production
                      ? "Delete production client"
                      : "Revoke OAuth client"
                  }
                  description={
                    production
                      ? `Deleting "${client.label}" removes its client ID and secret, and the app using them stops signing members in. The replacement you pick must already be live, and the choice is recorded in the audit log.`
                      : `Revoking "${client.label}" deletes its client ID and secret. Any project using them loses access immediately.`
                  }
                  submitLabel={production ? "Delete client" : "Revoke client"}
                >
                  <input type="hidden" name="intent" value="revoke-client" />
                  <input
                    type="hidden"
                    name="clientId"
                    value={client.clientId}
                  />
                  {production && (
                    <Select
                      name="replacementClientId"
                      required
                      disabled={replacements.length === 0}
                      aria-label="Replace with"
                      placeholder={
                        replacements.length === 0
                          ? "No other production client"
                          : "Replace with…"
                      }
                    >
                      {replacements.map((other) => (
                        <Select.Item
                          key={other.clientId}
                          value={other.clientId}
                        >
                          {other.label}
                        </Select.Item>
                      ))}
                    </Select>
                  )}
                  <FormButton
                    theme="rose"
                    variant="destructive"
                    size="sm"
                    type="submit"
                    disabled={
                      isPending || (production && replacements.length === 0)
                    }
                  >
                    {production ? "Delete client…" : "Revoke client…"}
                  </FormButton>
                </ConfirmDestructiveAction>
              </div>
            </SheetBody>

            <SheetFooter>
              {revealed !== null ? (
                <Button type="button" onClick={() => setAcknowledged(revealed)}>
                  <CheckIcon aria-hidden />
                  Done
                </Button>
              ) : (
                <SheetClose asChild>
                  <Button type="button" variant="ghost">
                    Close
                  </Button>
                </SheetClose>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
