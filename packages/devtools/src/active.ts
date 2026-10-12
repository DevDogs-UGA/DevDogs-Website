/**
 * Which command tree this process serves: the platform's, or a product's.
 *
 * Decided once, by the launcher, from whether the working directory is inside
 * a repository with a `devtools.config.json` (see `product/config.ts`). The
 * dispatcher and the help, menu and completion code ask here instead of
 * importing a tree, so the two modes cannot half-mix.
 */
import type { Catalog } from "@devdogsuga/cli-core/catalog";
import { catalog as platformCatalog } from "./catalog.js";
import { productCatalog } from "./product/catalog.js";

let product = false;

/** Switches to the product tree. Called by `launch()`; tests reset it. */
export function setProductMode(on: boolean): void {
  product = on;
}

export function isProductMode(): boolean {
  return product;
}

export function activeCatalog(): Catalog {
  return product ? productCatalog : platformCatalog;
}
