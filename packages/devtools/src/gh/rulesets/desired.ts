/**
 * The five fixed rulesets this repository must carry, as code.
 *
 * `apps/platform/src/server/github/rulesets.ts` (DevDogsUGA) has described
 * these in prose since it was written — its module doc counts them toward
 * the 75-ruleset cap — but nothing ever created them. TASK-322 is that gap:
 * `main-protection` blocked only deletion and force-push (a push landed on
 * `main` directly), `production` had no ruleset at all (a push there
 * deploys), and a stale `comp-branches` ruleset survived a naming change.
 * This module is the missing desired-state builder; `diff.ts` compares it
 * against what `gh api .../rulesets` actually reports; `commands.ts` is the
 * `devtools github rulesets` command that prints or applies the difference.
 *
 * ## Why a `team/**` creation-only ruleset is safe alongside per-team ones
 *
 * `rulesets.ts`'s constraint 2 warns against ever running a broad `team/**`
 * ruleset alongside the per-team ones `teamSync.ts` creates: rules AGGREGATE
 * across rulesets sharing a ref, but bypass does NOT, so a broad ruleset
 * restricting `update`/`push` would leave every team blocked by the broad
 * one while bypassing only its own — readable, unpushable, silently.
 *
 * That warning is about a ruleset carrying `update` (or `deletion`) on
 * `team/**`. This one carries `creation` ONLY. No per-team ruleset
 * (`teamRulesetPayload` in DevDogsUGA) has ever granted a `creation` rule —
 * `rulesets.ts`'s own doc says why: the branch is cut by `cutTeamBranch`
 * with the App's token before the per-team ruleset exists, so a `creation`
 * rule there would be inert on the first branch and would block
 * re-provisioning after a deletion. Two rulesets governing disjoint rule
 * TYPES on the same ref pattern don't aggregate into a conflict — there is
 * nothing for them to disagree about. What this ruleset closes is a real
 * hole `rulesets.ts` never covered: every team member holds a repository-wide
 * `push` grant (GitHub team permissions have no branch dimension), so
 * *before* the platform provisions a team, any member could `git push
 * origin HEAD:refs/heads/team/<slug>` and front-run the App — creating the
 * ref with content of their choosing, or squatting a slug that never gets
 * legitimately provisioned. Restricting `creation` to the App closes that,
 * and touches no rule a per-team ruleset owns.
 *
 * ## Fixed cost is now 5, not 4
 *
 * `rulesets.ts`'s constraint 3 said "Fixed cost is 4: `main`, `production`,
 * `~ALL` and the tag ruleset, leaving 71 for teams." This adds `team/**` as
 * a fifth fixed ruleset, so the constant there needs updating to 5 fixed /
 * 70 for teams — done alongside this file, in the same DevDogsUGA commit
 * that would eventually consume this reconciler's output.
 */
import type { DesiredRuleset } from "./types.js";

/** Resolved GitHub ids this module needs before it can build a plan. */
export interface RulesetActors {
  /** The `devops` team's numeric id (`GET /orgs/{org}/teams/devops`). */
  devopsTeamId: number;
  /** The `admins` team's numeric id — bypasses the tag ruleset, as it does live today. */
  adminsTeamId: number;
  /** The DevDogs Platform GitHub App's id (`app_id`, not the installation id). */
  appId: number;
}

/**
 * Canonical fixed-ruleset name -> earlier name(s) this reconciler recognizes
 * as the SAME slot, so the first run renames rather than creating a
 * duplicate that leaves the old one live and unmanaged.
 *
 * Only `main` has a legacy alias today (`main-protection`, live on GitHub as
 * of 2026-09-24). `production`, `~ALL` and `team/**` have no live ruleset to
 * rename — they are created fresh. The tag ruleset keeps its live name,
 * `tag-protection`, unchanged; nothing about its shape is wrong today, so
 * there is no rename to make.
 */
export const LEGACY_NAME_ALIASES: Readonly<Record<string, readonly string[]>> =
  {
    main: ["main-protection"],
  };

/** Ruleset names this reconciler deletes outright — nothing in the desired set replaces them. */
export const DELETE_RULESET_NAMES: readonly string[] = ["comp-branches"];

/**
 * A live ruleset name this reconciler must NEVER touch: one `teamSync.ts`
 * created and owns (`team/<slug>`, an exact-ref ruleset), as opposed to the
 * `team/**` wildcard-creation ruleset this module itself manages.
 *
 * `teamRulesetName()` in DevDogsUGA's `rulesets.ts` builds these as
 * `team/${slug}`, and slugs never contain `/`, so a live name is a per-team
 * ruleset iff it starts with `team/` and is not the literal `team/**` this
 * reconciler owns.
 */
export function isPerTeamRulesetName(name: string): boolean {
  return name.startsWith("team/") && name !== "team/**";
}

/**
 * The five fixed rulesets, built from resolved actor ids.
 *
 * Pure — no network, no `gh` — so `desired.test.ts` can assert the shape
 * without mocking anything, and `commands.ts` calls this only after
 * resolving `RulesetActors` from the live org.
 */
export function buildDesiredRulesets(actors: RulesetActors): DesiredRuleset[] {
  return [
    {
      name: "main",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/main"], exclude: [] },
      },
      // `devops` bypasses everything on `main`, including a direct push in
      // an emergency — unlike `production`, there is no deploy on the other
      // side of a `main` push, so `always` (not `pull_request`-only) is the
      // right bypass mode here.
      bypass_actors: [
        { actor_id: actors.devopsTeamId, actor_type: "Team", bypass_mode: "always" },
      ],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        // The bug this closes: `main-protection` carried `deletion` and
        // `non_fast_forward` only, so a plain `git push origin main` landed
        // directly. `update` restricts that to bypass actors.
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
        // Competition entries merge into `main` by squash — one commit per
        // entry, not the team branch's whole history.
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["squash"],
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_approving_review_count: 0,
            required_review_thread_resolution: false,
          },
        },
      ],
    },
    {
      name: "production",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/production"], exclude: [] },
      },
      // A push to `production` deploys (see `GITHUB_COMPETITION_REPO`'s doc
      // in DevDogsUGA's env.ts: "the production branch, not a second repo,
      // is the deploy boundary"). `devops` bypasses on PULL REQUESTS only —
      // `bypass_mode: "pull_request"` — so a Promote PR still needs the
      // code-owner review below even from devops; only a direct push
      // outside a PR bypasses freely, which devops should not have either
      // for the deploy boundary. Kept at `pull_request` rather than
      // dropping the bypass entirely because devops still needs to be able
      // to merge a Promote PR without waiting on a second reviewer when
      // nobody else is around.
      bypass_actors: [
        {
          actor_id: actors.devopsTeamId,
          actor_type: "Team",
          bypass_mode: "pull_request",
        },
      ],
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
        // Promote PRs merge as a single merge commit — `production`'s
        // history should read as one commit per promotion, traceable back
        // to the `main` state it promoted.
        {
          type: "pull_request",
          parameters: {
            allowed_merge_methods: ["merge"],
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: true,
            require_last_push_approval: false,
            required_approving_review_count: 1,
            required_review_thread_resolution: false,
          },
        },
      ],
    },
    {
      // `~ALL` is GitHub's own wildcard for "every branch in the
      // repository" (`target: "branch"` scopes it to `refs/heads/*`, never
      // tags). It exists to close the gap `teamSync.ts`'s header names
      // directly: every team member holds a repository-wide `push` grant,
      // because GitHub team permissions have no branch dimension, so
      // WITHOUT this ruleset any team member can push straight to any
      // branch that is not their own team's — including `main` and
      // `production`, if either of THOSE rulesets were ever misconfigured,
      // and including any other stray branch nothing else names. This is
      // deliberately the blunt, redundant backstop.
      name: "~ALL",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: {
          include: ["~ALL"],
          // MUST exclude `team/**`: rules aggregate across rulesets, and a
          // per-team ruleset's bypass (its own team, `always`) does not
          // exempt that team from a DIFFERENT ruleset's `update` rule
          // matching the same ref (`rulesets.ts`'s constraint 2). Without
          // this exclude, every team would be correctly bypassing its own
          // per-team ruleset and STILL blocked here — readable, unpushable,
          // and the cause invisible from either ruleset read alone.
          exclude: ["refs/heads/team/**"],
        },
      },
      bypass_actors: [
        { actor_id: actors.devopsTeamId, actor_type: "Team", bypass_mode: "always" },
      ],
      rules: [
        {
          type: "update",
          parameters: { update_allows_fetch_and_merge: false },
        },
      ],
    },
    {
      // Creation-only — see this file's header for why that is safe
      // alongside `teamRulesetName()`'s per-team rulesets, which carry no
      // `creation` rule and therefore never aggregate against this one.
      name: "team/**",
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/heads/team/**"], exclude: [] },
      },
      bypass_actors: [
        { actor_id: actors.appId, actor_type: "Integration", bypass_mode: "always" },
      ],
      rules: [{ type: "creation" }],
    },
    {
      // The tag ruleset `rulesets.ts`'s constraint 3 counts toward the fixed
      // cost but never named a shape for. Kept at its live name,
      // `tag-protection` — nothing about its current shape is the bug this
      // task fixes, so there is no rename to make, only a shape to hold
      // steady (a plan against the live fixture is a no-op here; see
      // `diff.test.ts`'s idempotence case).
      name: "tag-protection",
      target: "tag",
      enforcement: "active",
      conditions: {
        ref_name: { include: ["refs/tags/**"], exclude: [] },
      },
      bypass_actors: [
        { actor_id: actors.adminsTeamId, actor_type: "Team", bypass_mode: "always" },
        { actor_id: actors.devopsTeamId, actor_type: "Team", bypass_mode: "always" },
      ],
      rules: [{ type: "creation" }, { type: "update" }, { type: "deletion" }],
    },
  ];
}
