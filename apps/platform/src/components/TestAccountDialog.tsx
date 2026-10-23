"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  addTestAccount,
  updateTestAccount,
  type TestAccount,
} from "~/server/actions/testAccounts";
import FormButton from "./FormButton";
import { toast } from "~/lib/toast";
import Input from "~/components/Input";
import { Button } from "~/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/ui/dialog";

interface TestAccountDialogProps {
  account?: TestAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (account: TestAccount) => void;
}

export default function TestAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: TestAccountDialogProps) {
  const isEdit = account !== undefined;

  const mutation = useMutation({
    mutationFn: async (formData: FormData): Promise<TestAccount> => {
      if (isEdit) {
        await updateTestAccount(undefined, formData);
        return {
          ...account,
          displayName: formData.get("displayName") as string,
        };
      }
      const { testUserId, displayName } = await addTestAccount(formData);
      return {
        userId: testUserId,
        displayName,
        createdAt: new Date().toISOString(),
      };
    },
    onSuccess: (result) => {
      toast.success(isEdit ? "Test account updated" : "Test account added");
      onSuccess(result);
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to save test account",
      ),
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      mutation.mutate(new FormData(e.currentTarget));
    },
    [mutation],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}
    >
      <DialogContent
        onInteractOutside={(e) => mutation.isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => mutation.isPending && e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit test account" : "Add test account"}
          </DialogTitle>
          <DialogDescription>
            A sandboxed identity you can sign in as while testing your OAuth
            client.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {isEdit && (
            <input type="hidden" name="authUserId" value={account.userId} />
          )}

          <label className="field">
            <span className="label">Display name</span>
            <Input
              name="displayName"
              type="text"
              defaultValue={account?.displayName}
              placeholder="Jane Doe"
              maxLength={255}
              required
              autoFocus
            />
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="ghost"
                type="button"
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
            </DialogClose>
            <FormButton
              theme="cyan"
              type="submit"
              disabled={mutation.isPending}
            >
              {isEdit ? "Save" : "Add"}
            </FormButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
