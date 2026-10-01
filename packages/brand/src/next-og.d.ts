// The slice of `next/og` that `next.tsx` uses. Next's own package has no
// `exports` map, which `nodenext` resolution cannot follow from an ESM
// library, and the types are only needed here: a consumer's bundler resolves
// the real module (and its real types) when it builds the app.
declare module "next/og" {
  import type { ReactElement } from "react";

  export class ImageResponse extends Response {
    constructor(
      element: ReactElement,
      options?: {
        width?: number;
        height?: number;
        fonts?: {
          name: string;
          data: ArrayBuffer;
          weight?: number;
          style?: "normal" | "italic";
        }[];
      },
    );
  }
}
