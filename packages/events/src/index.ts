import meetings from "./data/meetings.json" with { type: "json" };
import { clubConfigSchema, type ClubConfig } from "./schema.js";
import { validateClubConfig, type ValidationIssue } from "./validator.js";

export * from "./schema.js";
export * from "./validator.js";

export class ClubConfigError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `${issues.length} events ${issues.length === 1 ? "issue" : "issues"} found:\n` +
        issues
          .map((issue) => `  [${issue.id}] ${issue.code}: ${issue.message}`)
          .join("\n"),
    );
    this.name = "ClubConfigError";
  }
}

/**
 * Parses and validates the committed data file, throwing a readable
 * `ClubConfigError` if either step fails.
 *
 * This is the ONE function most callers want. `check.ts` (the CI gate) and
 * `server/config/reconcile.ts` (the platform's runtime reader) both go
 * through it, so a config that is broken in either dimension -- wrong shape,
 * or right shape but unpublishable -- is refused identically wherever it is
 * read, rather than reconcile trusting a file CI would have rejected.
 */
export function getClubConfig(): ClubConfig {
  // A static import, never a read from disk: a bundler inlines it, and the
  // platform calls this from a Cloudflare Worker, which has no filesystem to
  // read `dist/` from. The data file sits under `src/` so `tsc` copies it into
  // `dist/` beside the module that imports it.
  return parseClubConfig(meetings);
}

/** The same two-step validation `getClubConfig` runs, over an in-memory
 * value rather than the committed file -- what `check.ts` and this
 * package's own tests use to exercise malformed input. */
export function parseClubConfig(raw: unknown): ClubConfig {
  const parsed = clubConfigSchema.parse(raw);
  const issues = validateClubConfig(parsed);
  if (issues.length > 0) throw new ClubConfigError(issues);
  return parsed;
}
