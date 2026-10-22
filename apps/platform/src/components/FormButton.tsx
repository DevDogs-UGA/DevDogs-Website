"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "~/ui/button";

/** The old colour themes, mapped onto the Cosmic variants. */
const THEME_VARIANT = {
  cyan: "default",
  black: "outline",
  rose: "danger-solid",
} as const;

type Props = Omit<ComponentProps<typeof Button>, "asChild" | "loading"> & {
  theme: keyof typeof THEME_VARIANT;
};

/** A submit-capable `Button` that shows its spinner while the enclosing form is pending. */
export default function FormButton({ theme, variant, ...props }: Props) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      variant={variant ?? THEME_VARIANT[theme]}
      loading={pending}
      data-pending={pending || undefined}
    />
  );
}
