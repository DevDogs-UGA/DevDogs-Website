"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button } from "~/ui/button";
import { toast } from "~/lib/toast";
import { cn } from "~/lib/cn";
import TestAccountDialog from "~/components/TestAccountDialog";
import {
  approveTestAccountAuthorization,
  denyOAuthAuthorization,
} from "~/server/actions/consent";
import type { TestAccount } from "~/server/actions/testAccounts";

interface ConsentFormProps {
  authorizationId: string;
  testAccounts: TestAccount[];
}

export default function ConsentForm({
  authorizationId,
  testAccounts: initialAccounts,
}: ConsentFormProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selected, setSelected] = useState<string | null>(
    initialAccounts[0]?.userId ?? null,
  );
  const [addOpen, setAddOpen] = useState(false);

  const [approveState, approveAction, approving] = useActionState(
    approveTestAccountAuthorization,
    null,
  );
  const [denyState, denyAction, denying] = useActionState(
    denyOAuthAuthorization,
    null,
  );

  const isPending = approving || denying;

  useEffect(() => {
    if (approveState) toast.error(approveState);
  }, [approveState]);

  useEffect(() => {
    if (denyState) toast.error(denyState);
  }, [denyState]);

  const handleAccountAdded = useCallback((account: TestAccount) => {
    setAccounts((prev) => [...prev, account]);
    setSelected(account.userId);
    setAddOpen(false);
  }, []);

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>
          Authorize your OAuth client
        </h1>
        <p className="help" style={{ marginTop: 8 }}>
          Your OAuth client is requesting access. Select a test account to
          authorize as.
        </p>
      </div>

      <form action={approveAction} className="flex flex-col gap-6">
        <input type="hidden" name="authorizationId" value={authorizationId} />
        {selected && <input type="hidden" name="testUserId" value={selected} />}

        <div className="flex flex-col gap-2">
          {accounts.length === 0 ? (
            <p className="help">
              No test accounts yet.{" "}
              <button
                type="button"
                className="textlink"
                onClick={() => setAddOpen(true)}
                disabled={isPending}
              >
                Add one
              </button>{" "}
              to continue.
            </p>
          ) : (
            <>
              <div
                role="radiogroup"
                aria-label="Test account"
                className="card flat"
                style={{ padding: 0 }}
              >
                {accounts.map((account) => {
                  const on = selected === account.userId;
                  return (
                    <button
                      key={account.userId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={cn("set-hopt w-full text-left", on && "sel")}
                      onClick={() => setSelected(account.userId)}
                      disabled={isPending}
                    >
                      <span
                        className={cn("check radio", on && "on")}
                        aria-hidden
                      >
                        <i />
                      </span>
                      <span className="min-w-0">
                        <b className="truncate">{account.displayName}</b>
                      </span>
                    </button>
                  );
                })}
              </div>

              {accounts.length < 5 && (
                <button
                  type="button"
                  className="textlink self-start"
                  onClick={() => setAddOpen(true)}
                  disabled={isPending}
                >
                  + Add another test account
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={approving}
            disabled={isPending || !selected}
          >
            Authorize
          </Button>
          <Button
            type="submit"
            variant="ghost"
            formAction={denyAction}
            className="w-full"
            loading={denying}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      </form>

      <TestAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAccountAdded}
      />
    </div>
  );
}
