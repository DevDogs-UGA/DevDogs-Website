import { AppIcon } from "@devdogsuga/og";
import { imageResponse } from "~/lib/ogImage";

/**
 * The favicon, and the larger of the two icons `manifest.ts` declares.
 *
 * Next's file convention with the artwork generated rather than committed: the
 * same `AppIcon` the CLI renders to disk, so a change to the tile or the mascot
 * moves the tab icon without anybody re-exporting a PNG. 512 is the size a web
 * app manifest must carry; `AppIcon` scales off its `size` prop, so this is one
 * drawing rather than a second one that has to be kept in step.
 */
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return imageResponse(AppIcon({ app: "platform", size: size.width }), size);
}
