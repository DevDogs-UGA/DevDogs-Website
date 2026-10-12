import { pageOgImage, contentType, size } from "@devdogsuga/sdk/brand/next";

/** The link card for `/partners`. Copy and colour live in `@devdogsuga/sdk/brand`. */
const card = pageOgImage("/partners");

export const alt = card.alt;
export { contentType, size };

export default card.Image;
