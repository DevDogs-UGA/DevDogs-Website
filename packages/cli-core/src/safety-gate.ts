/**
 * The production and staging safety gate.
 *
 * devtools can reach any tier, and it cannot tell which `supabase`
 * subcommands write, so the question is asked before ANY command runs against
 * a hosted tier, passthroughs and presets included. This replaces the
 * per-command confirmations `db reset`, `db migrate`, `seed production` and
 * `cf preview` each used to carry.
 *
 *   * production: shows the tier and project ref (never the `DB_URL`, which
 *     holds the password) and asks once, defaulting to no.
 *   * staging: the same, with milder wording.
 *   * non-interactive runs need `--yes`; without it the gate refuses instead
 *     of hanging on a prompt nobody can answer. clack's `confirm()` never
 *     resolves without a TTY, so `--yes` is checked before anything that
 *     could wait on one.
 *   * development (local or remote): no prompt.
 */
import { confirm } from "@clack/prompts";
import { formatCommand } from "./process-group.js";
import { unwrap } from "./ui.js";

/** Set once the gate passed, so a devtools run spawned by devtools does not ask again. */
export const GATE_PASSED_ENV = "DEVTOOLS_GATE_PASSED";

export interface GateInput {
  /** The session's deploy tier. */
  tier: string;
  /** The tier's project ref; `undefined` when its env was not loaded. */
  projectRef: string | undefined;
  /** What is about to run, as typed (after `devtools`). Redacted before display. */
  argv: readonly string[];
  yes: boolean;
  nonInteractive: boolean;
  /** Injectable for tests; defaults to a clack `confirm` defaulting to no. */
  ask?: (message: string) => Promise<boolean>;
  env?: NodeJS.ProcessEnv;
}

export type GateOutcome =
  { proceed: true } | { proceed: false; reason: "refused" | "declined" };

const HOSTED = new Set(["staging", "production"]);

export function isHostedTier(tier: string): boolean {
  return HOSTED.has(tier);
}

async function askClack(message: string): Promise<boolean> {
  return unwrap(await confirm({ message, initialValue: false }));
}

/**
 * Decides whether a command may run against `tier`. Writes its own refusal to
 * stderr, so the caller only has to exit non-zero on `proceed: false`.
 */
export async function gateHostedTier(input: GateInput): Promise<GateOutcome> {
  const env = input.env ?? process.env;
  if (!isHostedTier(input.tier)) return { proceed: true };
  if (env[GATE_PASSED_ENV] === input.tier) return { proceed: true };

  const production = input.tier === "production";
  const target = `${production ? "PRODUCTION" : "staging"} (project ${input.projectRef ?? "unknown"})`;
  const command = formatCommand("devtools", input.argv);

  // ⚠️ SAFETY: `--yes` is the one way past this with no terminal, checked
  // before anything TTY-dependent runs.
  if (input.yes) {
    if (input.nonInteractive) {
      process.stderr.write(
        `devtools: running \`${command}\` against ${target}.\n`,
      );
    }
    return { proceed: true };
  }
  if (input.nonInteractive) {
    process.stderr.write(
      `devtools: refusing to run \`${command}\` against ${target} without --yes. ` +
        "Nobody is here to confirm it.\n",
    );
    return { proceed: false, reason: "refused" };
  }

  const ask = input.ask ?? askClack;
  const confirmed = await ask(
    production
      ? `This runs \`${command}\` against PRODUCTION, project ${input.projectRef ?? "unknown"}. It is live data. Continue?`
      : `This runs \`${command}\` against staging, project ${input.projectRef ?? "unknown"}. Continue?`,
  );
  if (!confirmed) {
    process.stderr.write(`devtools: left ${input.tier} alone.\n`);
    return { proceed: false, reason: "declined" };
  }
  return { proceed: true };
}
