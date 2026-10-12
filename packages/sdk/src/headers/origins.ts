/**
 * Origins every app needs, as CSP source expressions, grouped by the
 * directive they belong in. Apps add their own (Supabase, Sentry, widgets)
 * next to these; nothing app-specific belongs here.
 */
export const SHARED_ORIGINS = {
  /**
   * `img-src`: the GitHub OAuth provider stores an `avatar_url` on this host.
   * Allowlisted defensively for an already-captured value. Other providers'
   * avatar hosts (Google, Discord, LinkedIn) are deliberately absent: add
   * them in the app that renders them.
   */
  img: ["https://avatars.githubusercontent.com"],
} as const;
