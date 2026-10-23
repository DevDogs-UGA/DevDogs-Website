"use client";

import { useRouter } from "next/navigation";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { Button } from "~/ui/button";
import { useProfileIdentity } from "~/hooks/useProfileIdentity";

interface Props {
  userId: string;
  involvementFullName: string;
}

export default function SyncPreferredNameButton({
  userId,
  involvementFullName,
}: Props) {
  const router = useRouter();
  const { saveName, isNamePending } = useProfileIdentity(
    userId,
    involvementFullName,
  );

  async function handleClick() {
    try {
      await saveName();
      router.refresh();
    } catch {
      // error toast already shown by useProfileIdentity
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isNamePending}
      loading={isNamePending}
    >
      <ArrowCounterClockwiseIcon aria-hidden />
      {`Update Name to "${involvementFullName}"`}
    </Button>
  );
}
