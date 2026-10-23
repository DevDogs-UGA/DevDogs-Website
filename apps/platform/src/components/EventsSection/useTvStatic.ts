"use client";

import { useEffect, useRef } from "react";

/** The picture is 96x72 and scaled up pixelated, so each grain is a chunky pixel. */
const WIDTH = 96;
const HEIGHT = 72;
/** ~15 fps: snow at 60 does not look better, it looks the same and costs four times as much. */
const FRAME_MS = 66;

/**
 * Grey noise for the television's no-signal picture, drawn a frame at a time
 * into a canvas and scaled up with `image-rendering: pixelated`. Returns the
 * ref to hang on the `<canvas>`.
 *
 * Noise is cheaper to generate than to fetch, because it has no content to be
 * faithful to. Two gates keep it from costing anything it should not:
 *
 * - **On screen.** An IntersectionObserver starts and stops the loop, so the
 *   set does no work until it scrolls into view and none once it leaves.
 * - **Reduced motion.** A visitor who has asked for less movement gets a
 *   single frozen frame of snow, not a black screen and not a flicker.
 *
 * A hidden tab is covered for free: `requestAnimationFrame` stops being
 * delivered, so the loop suspends itself without a `visibilitychange`
 * listener.
 */
export function useTvStatic() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const image = ctx.createImageData(WIDTH, HEIGHT);
    const pixels = image.data;
    const draw = () => {
      for (let i = 0; i < pixels.length; i += 4) {
        const v = 40 + Math.random() * 190;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };
    draw();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let last = 0;
    let frame = 0;

    const loop = (t: number) => {
      frame = 0;
      if (still.matches || !visible) return;
      if (t - last > FRAME_MS) {
        last = t;
        draw();
      }
      frame = requestAnimationFrame(loop);
    };
    const kick = () => {
      if (!frame && !still.matches && visible) {
        frame = requestAnimationFrame(loop);
      }
    };

    const observer = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      kick();
    });
    observer.observe(canvas);
    still.addEventListener("change", kick);
    kick();

    return () => {
      observer.disconnect();
      still.removeEventListener("change", kick);
      cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}
