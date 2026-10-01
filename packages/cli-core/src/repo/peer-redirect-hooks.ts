/**
 * Module-loader hooks for `repo/peer-redirect.ts`. Runs on Node's loader
 * thread, not the main one, so nothing here can import devtools state: the
 * redirects arrive once, as `initialize()`'s data, and are never updated.
 */
import type { InitializeHook, ResolveHook } from "node:module";

export interface PeerRedirect {
  /** The exact file URL of the importing module the redirect applies to. */
  parentURL: string;
  /** The bare specifier it imports, e.g. `@devdogsuga/env`. */
  specifier: string;
  /** Where that specifier should resolve instead. */
  url: string;
}

let redirects: PeerRedirect[] = [];

export const initialize: InitializeHook<PeerRedirect[]> = (data) => {
  redirects = data;
};

export const resolve: ResolveHook = (specifier, context, nextResolve) => {
  const redirect = redirects.find(
    (r) => r.specifier === specifier && r.parentURL === context.parentURL,
  );
  if (redirect) return { url: redirect.url, shortCircuit: true };
  return nextResolve(specifier, context);
};
