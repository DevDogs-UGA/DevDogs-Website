"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/ui/sheet";
import {
  BUILDING_ADDRESS,
  BUILDING_FULL_NAME,
  locationLine,
} from "./buildings";
import type { BuildingKey } from "./campusMapMeta";

interface Props {
  /** Omit both to let the drawer own its state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which building the header names. */
  building?: BuildingKey;
  /** The room inside it, for the title. */
  room?: string | null;
  /** The element that opens it; none when a route decides that instead. */
  trigger?: ReactNode;
  /** The body below the title, normally `FindUsContent`. */
  children: ReactNode;
}

/**
 * Directions as a right-hand drawer (D1). It opens over whatever page the
 * reader is on, so "Find us" on a meeting does not drop them onto the
 * schedule. `/events/directions` renders this same drawer open over the events
 * page, so a pasted or printed link still lands somewhere.
 *
 * The title is the place as a member says it, "DLW 124". The two lines under it
 * are the same place as a stranger needs it: the building's full name, then its
 * street address. Nothing about what happens there; that is the meeting's job,
 * and this is only ever about *where*.
 */
export default function FindUsDrawer({
  open,
  onOpenChange,
  building = "DLW",
  room = "124",
  trigger,
  children,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent side="right">
        <SheetHeader>
          <div>
            <SheetTitle>{locationLine(building, room)}</SheetTitle>
            <SheetDescription>
              {BUILDING_FULL_NAME[building]}
              <br />
              {BUILDING_ADDRESS[building]}
            </SheetDescription>
          </div>
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
      </SheetContent>
    </Sheet>
  );
}
