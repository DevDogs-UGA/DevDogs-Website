"use client";

import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { useAvatarSrc } from "~/hooks/useAvatarUpload";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "~/ui/avatar";

/**
 * The member's face in the bar: the ui Avatar, with the setup warning as its
 * `AvatarBadge` (the status dot) rather than a dot drawn over it.
 */
export default function NavAvatar({
  userId,
  preferredName,
  warning = false,
}: {
  userId: string;
  preferredName: string;
  warning?: boolean;
}) {
  const src = useAvatarSrc(userId);
  const initials = preferredName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <Avatar>
      <AvatarImage src={src} alt="" />
      <AvatarFallback>{initials}</AvatarFallback>
      {warning && (
        <AvatarBadge aria-hidden>
          <WarningCircleIcon weight="bold" />
        </AvatarBadge>
      )}
    </Avatar>
  );
}
