"use client";

import Image from "next/image";
import { useState } from "react";

/** "Jack Harrington" -> "JH". */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

interface Props {
  name: string;
  src: string | null;
  /**
   * The visor's rendered width in CSS pixels. Always a constant, never a
   * viewport fraction: `fill` defaults `sizes` to `100vw`, which fetched these
   * headshots at w=1920 to fill 75 physical pixels.
   */
  sizes: string;
}

/**
 * An officer's headshot for the helmet's visor, or their initials when there is
 * not one. The initials sit on the visor's own colour (`--ph` on the helmet).
 *
 * The `avatars` bucket is keyed by bare user id, so a URL can always be
 * composed for an officer whether or not they have ever uploaded anything:
 * "no avatar" is a 404, not a null. That is why the error branch matters as
 * much as the missing-src one, and why it is the same branch. Officers join the
 * board before they send a photo, and a visor showing a broken image is worse
 * than one showing a monogram.
 */
export default function Headshot({ name, src, sizes }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <span aria-hidden>{initials(name)}</span>;
  }

  return (
    <Image
      fill
      // The name is printed beside the helmet, so the picture adds nothing a
      // screen reader needs to hear twice.
      alt=""
      src={src}
      sizes={sizes}
      onError={() => setFailed(true)}
      style={{ objectFit: "cover", objectPosition: "center" }}
    />
  );
}
