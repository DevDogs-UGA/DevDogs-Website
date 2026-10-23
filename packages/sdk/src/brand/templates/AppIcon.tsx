import * as React from "react";
import { APPS, type AppKey } from "../apps.js";
import { MARK } from "../tokens.js";
import { COSMIC } from "../brand.js";
import { DogDaysMark, DogPackMark } from "../marks.js";
import { Mark } from "../primitives.js";

/**
 * One app's icon: its mark on its colour, a flat square that fills the canvas.
 *
 * No border, shadow or shaped corners: every surface that shows an app icon
 * (iOS, Android launchers, browser tabs, the install prompt) crops and rounds
 * it itself, and an outline drawn here would be cut through by that mask.
 * Opaque edge to edge, so nothing behind it shows through either.
 *
 * Everything scales off `size`, so 32 and 1024 are the same artwork rather than
 * two drawings.
 */
export interface AppIconProps {
  app: AppKey;
  size: number;
}

export function AppIcon({ app, size }: AppIconProps) {
  const brand = APPS[app];

  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: brand.ground,
      }}
    >
      <AppMark app={app} size={Math.round(size * 0.56)} color={brand.mark} />
    </div>
  );
}

function AppMark({
  app,
  size,
  color,
}: {
  app: AppKey;
  size: number;
  color: string;
}) {
  if (app === "dogdays") return <DogDaysMark size={size} color={color} />;
  if (app === "dogpack") return <DogPackMark size={size} color={color} />;

  // The platform's mark is the mascot, which is full-colour artwork and taller
  // than it is wide. Sized by height so it fills the tile the way the
  // one-colour marks do, and left uncoloured — `color` is meaningless for it.
  return <Mark asset={MARK} height={size} />;
}

/** Kept beside the icon so a caller tinting a mark has the ink to hand. */
export const ICON_INK = COSMIC["ink-line"];
