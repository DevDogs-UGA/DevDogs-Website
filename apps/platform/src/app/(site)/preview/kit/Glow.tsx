"use client";

import { useCursorGlow } from "~/hooks/useCursorGlow";

/** Turns the proximity glow on for the page it sits in. */
export default function Glow() {
  useCursorGlow();
  return null;
}
