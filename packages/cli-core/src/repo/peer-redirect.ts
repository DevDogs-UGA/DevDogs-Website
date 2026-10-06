/**
 * Points one module's bare import of a peer at the copy the target repo
 * resolved (`repo/peers.ts`).
 *
 * devtools' own `env.ts` manifest imports `@devdogsuga/env` by bare
 * specifier, and from an installed copy that specifier resolves relative to
 * the manifest's own location: inside the pnpm store, next to devtools,
 * where an optional peer is never installed under `pnpm dlx`. The import
 * failed with ERR_MODULE_NOT_FOUND, and every `env` command with it. Even
 * where the specifier does resolve (devtools installed as a devDependency),
 * the only copy that keeps the registry's module identity is the one the
 * repo's manifests use, so the redirect is applied whenever that copy is
 * known rather than only as a fallback.
 *
 * Node resolve hooks (`module.register`) rather than rewriting the file: the
 * manifest also imports `zod`, which has to keep resolving from devtools'
 * own location, and a copy written anywhere else would lose that.
 */
import { register } from "node:module";
import type { PeerRedirect } from "./peer-redirect-hooks.js";

/** Registers `redirect`. Hooks cannot be unregistered, so each call adds a
 *  loader for the rest of the process; call it once per redirect. */
export function redirectPeer(redirect: PeerRedirect): void {
  redirectPeers([redirect]);
}

/** `redirectPeer` for several at once: the hooks keep one table per
 *  registration, so everything that needs redirecting goes in one call. */
export function redirectPeers(redirects: PeerRedirect[]): void {
  register("./peer-redirect-hooks.js", import.meta.url, {
    data: redirects,
  });
}
