"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
  type SubmitEvent,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "~/ui/alert-dialog";
import { Input } from "~/ui/input";

interface Props extends PropsWithChildren {
  title: string;
  description: ReactNode;
  action: (formData: FormData) => Promise<void> | void;
  submitLabel: string;
  userConfirmText?: string;
}

export default function ConfirmDestructiveAction({
  title,
  description,
  action,
  submitLabel,
  userConfirmText,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);

  const disableConfirmButton = useMemo(
    () => userConfirmText !== undefined && userConfirmText !== typed,
    [userConfirmText, typed],
  );

  const handleSubmit = useCallback((e: SubmitEvent<HTMLFormElement>) => {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    e.preventDefault();
    setOpen(true);
    setTyped("");
  }, []);

  const handleConfirm = useCallback(() => {
    if (formRef.current && !disableConfirmButton) {
      confirmed.current = true;
      formRef.current.requestSubmit();
    }
  }, [disableConfirmButton]);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <form
        className="contents"
        action={action}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
      </form>

      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>

        {userConfirmText !== undefined && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span>
              Type <code>{userConfirmText}</code> to confirm.
            </span>
            <Input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger-solid"
            disabled={disableConfirmButton}
            onClick={handleConfirm}
            type="button"
          >
            {submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
