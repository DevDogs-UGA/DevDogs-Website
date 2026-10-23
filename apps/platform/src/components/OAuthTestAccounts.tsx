"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import EmptyState from "~/ui/empty-state";
import {
  deleteTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import TestAccountDialog from "./TestAccountDialog";
import { toast } from "~/lib/toast";

const MAX_TEST_ACCOUNTS = 5;

interface Props {
  initialAccounts: TestAccount[];
}

export default function OAuthTestAccounts({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<TestAccount[]>(initialAccounts);
  const [addOpen, setAddOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<TestAccount | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteTestAccount,
    onSuccess: (_, authUserId) => {
      setAccounts((prev) => prev.filter((a) => a.userId !== authUserId));
      toast.success("Test account deleted");
    },
    onError: () => toast.error("Failed to delete test account"),
  });

  const handleAdded = useCallback((account: TestAccount) => {
    setAccounts((prev) => [...prev, account]);
  }, []);

  const handleUpdated = useCallback((account: TestAccount) => {
    setAccounts((prev) =>
      prev.map((a) => (a.userId === account.userId ? account : a)),
    );
  }, []);

  const atLimit = accounts.length >= MAX_TEST_ACCOUNTS;

  return (
    <>
      {accounts.length === 0 ? (
        <EmptyState
          image={false}
          title="No test accounts yet"
          description="Add one to use during authorization."
        />
      ) : (
        <div className="set-rows" role="list">
          {accounts.map((account) => (
            <div role="listitem" key={account.userId} className="arow">
              <div className="min-w-0">
                <b className="truncate">{account.displayName}</b>
                <span className="small muted truncate font-mono">
                  {account.userId}
                </span>
              </div>
              <div className="end flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="iconbtn"
                  onClick={() => setEditAccount(account)}
                  aria-label={`Edit ${account.displayName}`}
                >
                  <PencilSimpleIcon />
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  onClick={() => deleteMutation.mutate(account.userId)}
                  disabled={
                    deleteMutation.isPending &&
                    deleteMutation.variables === account.userId
                  }
                  aria-label={`Delete ${account.displayName}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 16, gap: 12 }}>
        {!atLimit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddOpen(true)}
          >
            <PlusIcon aria-hidden />
            Create a test account
          </Button>
        )}
        <span className="small muted">
          {accounts.length} of {MAX_TEST_ACCOUNTS} test accounts. Selected
          during authorization.
        </span>
      </div>

      <TestAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={handleAdded}
      />
      {editAccount && (
        <TestAccountDialog
          account={editAccount}
          open={editAccount !== null}
          onOpenChange={(o) => {
            if (!o) setEditAccount(null);
          }}
          onSuccess={handleUpdated}
        />
      )}
    </>
  );
}
