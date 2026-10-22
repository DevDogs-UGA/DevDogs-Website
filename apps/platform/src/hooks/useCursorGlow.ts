"use client";

import { useEffect } from "react";

/**
 * Cards that link somewhere answer the pointer with a dithered glow centred on
 * it (cosmic.css "cursor glow", chrome.js in the mockups). The glow follows the
 * pointer even outside a card, so its rim starts to show as the pointer comes
 * within reach and brightens as it closes in; the card's face clips it.
 * Positions snap to the glow's 3px cell so the dither stays on the card's pixel
 * grid.
 *
 * One passive pointer listener (mouse only) and one scroll listener, both
 * coalesced into a single animation frame. Cards are looked up when a frame
 * paints, so ones that mount later light up without re-registering. Call it
 * once per page, from a client component.
 */
const SELECTOR =
  ".cosmic :is(a.card, button.card, .card[tabindex], .card:has(.title > a))";
const REACH = 240;
const CELL = 3;

const snap = (value: number) => Math.round(value / CELL) * CELL;

export function useCursorGlow(): void {
  useEffect(() => {
    const lit = new Set<HTMLElement>();
    let x: number | null = null;
    let y: number | null = null;
    let queued = false;
    let frame = 0;

    const off = (card: HTMLElement) => {
      card.style.removeProperty("--gx");
      card.style.removeProperty("--gy");
      lit.delete(card);
    };

    const paint = () => {
      queued = false;
      const cards = document.querySelectorAll<HTMLElement>(SELECTOR);
      for (const card of lit) if (!card.isConnected) lit.delete(card);
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const near =
          x !== null &&
          y !== null &&
          x > r.left - REACH &&
          x < r.right + REACH &&
          y > r.top - REACH &&
          y < r.bottom + REACH;
        if (!near || x === null || y === null) {
          if (lit.has(card)) off(card);
          continue;
        }
        card.style.setProperty("--gx", `${snap(x - r.left) - REACH}px`);
        card.style.setProperty("--gy", `${snap(y - r.top) - REACH}px`);
        lit.add(card);
      }
    };

    const queue = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(paint);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      queue();
    };
    const onScroll = () => {
      if (x !== null) queue();
    };
    const onLeave = () => {
      x = y = null;
      queue();
    };

    const root = document.documentElement;
    document.addEventListener("pointermove", onMove, { passive: true });
    addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      removeEventListener("scroll", onScroll);
      root.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
      for (const card of lit) off(card);
    };
  }, []);
}
