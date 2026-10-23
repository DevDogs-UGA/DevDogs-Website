import * as React from "react";
import { APPS, type AppKey } from "../apps.js";
import { MARK } from "../tokens.js";
import { COSMIC } from "../brand.js";
import { Stepped } from "./CardShell.js";
import { DogDaysMark, DogPackMark } from "../marks.js";
import { Mark } from "../primitives.js";

/**
 * One app's icon: its mark, on its colour, with the border and block shadow
 * the rest of the site is drawn with.
 *
 * Everything scales off `size`, so 32 and 1024 are the same artwork rather than
 * two drawings. The proportions are fixed as fractions of the canvas, which is
 * what keeps a favicon recognisable as the same object as the 512px PWA icon
 * beside it.
 *
 * Below roughly 48px the border and shadow are a pixel each and stop reading as
 * separate shapes — the icon degrades into a coloured rounded square with a
 * mark on it, which is the right thing for it to degrade into. It is drawn
 * rather than skipped so a 32px favicon and a 512px icon are never two
 * different marks.
 */
export interface AppIconProps {
  app: AppKey;
  size: number;
  /**
   * Fills the corners outside the tile instead of leaving them transparent.
   * Wanted by the surfaces that composite an icon onto their own background and
   * round it themselves — iOS home screens, most notably, which paint an opaque
   * square behind anything transparent and would otherwise show white.
   */
  background?: string;
}

export function AppIcon({ app, size, background }: AppIconProps) {
  const brand = APPS[app];

  // Fractions of the canvas, so the shadow keeps its distance at every size.
  // The tile is inset by exactly the shadow's throw plus the outer margin, so
  // the offset shadow is never clipped by the image edge.
  // Every length is snapped to whole pixels: a fractional step leaves the
  // sliver and the middle column meeting mid-pixel, and the rasteriser
  // anti-aliases the gap so the ink tile beneath shows through as a seam.
  const margin = Math.round(size * 0.06);
  const shadow = Math.round(size * 0.055);
  const border = Math.max(1, Math.round(size * 0.025));
  const tile = size - margin * 2 - shadow;
  // Cosmic corners are stepped cells, not radii: one cell, a fifth of a
  // percent short of a quarter of the tile, never under a pixel.
  const step = Math.max(1, Math.round(tile * 0.05));
  // The fill is its own stepped tile laid over the ink one, inset by exactly
  // one border on every side, so the outline has the same weight all round.
  // An even border around a stepped tile is that tile eroded by the border,
  // which keeps the notch size, so the fill's step equals the ink's and an L
  // of ink wraps every corner.
  const inner = tile - border * 2;
  const fillStep = step;
  const fillMiddle = inner - fillStep * 2;

  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: background ?? "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          position: "relative",
          width: tile + shadow,
          height: tile + shadow,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: shadow,
            top: shadow,
          }}
        >
          <Stepped color={COSMIC["ink-line"]} step={step}>
            <div
              style={{ display: "flex", width: tile - step * 2, height: tile }}
            />
          </Stepped>
        </div>
        <Stepped color={COSMIC["ink-line"]} step={step}>
          <div
            style={{ display: "flex", width: tile - step * 2, height: tile }}
          />
        </Stepped>
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: border,
            top: border,
          }}
        >
          <Stepped color={brand.ground} step={fillStep}>
            <div
              style={{
                display: "flex",
                width: fillMiddle,
                height: inner,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppMark app={app} size={Math.round(tile * 0.62)} color={brand.mark} />
            </div>
          </Stepped>
        </div>
      </div>
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
