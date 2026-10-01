/**
 * The production-preview gate: running a local Worker against live production
 * data (DB_URL, third-party API keys, the lot) from a developer's machine is
 * the same exposure `cron run` and `workflows run` gate behind a confirm.
 * Staging and development carry no such weight and ask for nothing.
 */
export interface ConfirmProductionOptions {
  tier: string;
  /** What is about to touch live data, e.g. "platform". */
  what: string;
  /** `--yes`. */
  yes: boolean;
  isTTY: boolean;
  /** Answers the question; defaults to a readline prompt on stdin/stderr. */
  ask?: (question: string) => Promise<boolean>;
}

export type ConfirmProductionResult =
  { ok: true } | { ok: false; reason: string };

async function askOnTerminal(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function confirmProduction(
  options: ConfirmProductionOptions,
): Promise<ConfirmProductionResult> {
  if (options.tier !== "production" || options.yes) return { ok: true };
  if (!options.isTTY) {
    return { ok: false, reason: "--yes is required to preview production." };
  }
  const approved = await (options.ask ?? askOnTerminal)(
    `Run ${options.what} against live production data?`,
  );
  return approved ? { ok: true } : { ok: false, reason: "not confirmed." };
}
