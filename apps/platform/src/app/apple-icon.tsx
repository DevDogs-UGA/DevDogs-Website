import { AppIcon } from "@devdogsuga/sdk/brand";
import { imageResponse } from "@devdogsuga/sdk/brand/next";

/**
 * The iOS home-screen tile.
 *
 * 180 is the size iOS asks for. The icon is opaque edge to edge; iOS rounds
 * it itself.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return imageResponse(AppIcon({ app: "platform", size: size.width }), size);
}
