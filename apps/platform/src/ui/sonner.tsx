"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react/ssr";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon weight="bold" className="size-4" />,
        info: <InfoIcon weight="bold" className="size-4" />,
        warning: <WarningIcon weight="bold" className="size-4" />,
        error: <XCircleIcon weight="bold" className="size-4" />,
        loading: <SpinnerIcon weight="bold" className="size-4 animate-spin" />,
      }}
      // Plain sonner toasts (`toast("…")`) wear the kit's `.toast` card; the
      // site's own typed toasts are `~/ui/toast` through `~/lib/toast`.
      gap={14}
      expand={false}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "toast",
          title: "min-w-0 flex-1",
          description: "text-[var(--text-2)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
