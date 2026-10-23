"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GameControllerIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import Callout from "~/ui/callout";
import { Checkbox } from "~/ui/checkbox";
import type { RoleRow } from "~/hooks/useRoles";
import {
  createDiscordRoleFromRole,
  linkRoleToDiscord,
  listImportableDiscordRoles,
} from "~/server/actions/discordRoleSync";
import {
  canManageDiscordRolePosition,
  type DiscordSyncCapability,
} from "~/lib/discordCapability";
import type { ImportableDiscordRole } from "~/server/discord/roleSync";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/ui/dialog";

interface Props {
  role: RoleRow;
  callerCapability: DiscordSyncCapability;
}

export default function LinkDiscordRoleDialog({
  role,
  callerCapability,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [discordRoles, setDiscordRoles] = useState<ImportableDiscordRole[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSync =
    callerCapability.linked &&
    (callerCapability.isOwner || callerCapability.hasManageRoles);
  const triggerDisabledReason = !callerCapability.linked
    ? "Link your Discord account to use Discord sync."
    : !canSync
      ? "Your Discord account needs the Manage Roles permission."
      : null;
  const canCreateNew = canManageDiscordRolePosition(callerCapability, 0);

  function handleOpen(v: boolean) {
    setOpen(v);
    if (!v) return;

    setMode("existing");
    setSelectedId("");
    setError(null);
    setLoading(true);
    listImportableDiscordRoles()
      .then(setDiscordRoles)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !selectedId) {
      setError("Select a Discord role to link.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      if (mode === "existing") {
        await linkRoleToDiscord(role.id, selectedId);
      } else {
        await createDiscordRoleFromRole(role.id);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <span title={triggerDisabledReason ?? undefined}>
        <DialogTrigger asChild disabled={!canSync}>
          <Button type="button" variant="outline" size="sm" disabled={!canSync}>
            <GameControllerIcon weight="bold" aria-hidden />
            Link to Discord
          </Button>
        </DialogTrigger>
      </span>

      <DialogContent className="max-w-md" showCloseButton={false}>
        <form onSubmit={handleSubmit} className="con-stack">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle>
              Link &ldquo;{role.title}&rdquo; to Discord
            </DialogTitle>
            <DialogClose className="iconbtn" aria-label="Close">
              <XIcon weight="bold" aria-hidden />
            </DialogClose>
          </DialogHeader>

          <fieldset className="con-checks">
            <legend className="sr-only">How to link</legend>
            <Checkbox
              type="radio"
              name="mode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
              label="Link to an existing Discord role"
            />
            {mode === "existing" && (
              <span className="input select">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={loading}
                  aria-label="Discord role"
                >
                  <option value="">
                    {loading ? "Loading…" : "Select a Discord role…"}
                  </option>
                  {discordRoles.map((r) => {
                    const canManage = canManageDiscordRolePosition(
                      callerCapability,
                      r.position,
                    );
                    return (
                      <option key={r.id} value={r.id} disabled={!canManage}>
                        {r.name}
                        {canManage ? "" : " (above your Discord roles)"}
                      </option>
                    );
                  })}
                </select>
              </span>
            )}

            <span
              title={
                canCreateNew
                  ? undefined
                  : "Your Discord account doesn't have permission to create Discord roles."
              }
            >
              <Checkbox
                type="radio"
                name="mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
                disabled={!canCreateNew}
                label="Create a new Discord role from this role"
              />
            </span>
          </fieldset>

          <p className="small muted" style={{ margin: 0 }}>
            Name, color and membership will sync with Discord going forward.
            Current holders keep the role; those with a known Discord account
            are granted it on Discord, and anyone else is granted it once they
            link.
          </p>

          {error && (
            <Callout tone="critical" alert>
              {error}
            </Callout>
          )}

          <div
            className="acts"
            style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
          >
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              loading={submitting}
              disabled={
                submitting ||
                loading ||
                (mode === "existing" && !selectedId) ||
                (mode === "new" && !canCreateNew)
              }
            >
              Link
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
