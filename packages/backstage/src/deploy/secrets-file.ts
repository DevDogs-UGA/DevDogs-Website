/**
 * The `--secrets-file` a `wrangler deploy` uploads with one Worker.
 *
 * `deploy <app>` writes it, uploads it and removes it; the deprecated
 * `devtools-ci deploy secrets-file --app <app>` still writes it for a workflow
 * that uploads it itself (see `ci-alias.ts`). Runs with `process.env` holding
 * the environment `deploy write-env` composed. It reads no GitHub context of
 * its own: one place in the pipeline touches `secrets` and `vars`, and this is
 * not it.
 *
 * ## Which keys, and why they are derived rather than listed
 *
 * `buildWorkerEnv(app, env, "deploy")` in `@devdogsuga/env`, the same function
 * `with-env` uses for the env file `wrangler dev` reads, so what runs locally
 * and what is uploaded cannot drift apart. It is `storableKeys()` intersected
 * with the keys the app's own manifest declares. A hand-written list per
 * Worker is the exact failure the registry was built to remove: a variable
 * added to `src/env.ts` and forgotten in the list is simply absent from the
 * deployed environment, and the first thing that reads it fails at run time in
 * production.
 *
 * Two exclusions follow from that rule rather than being special cases:
 *
 *   * `:tooling` sources — declared for the deploy pipeline itself, not for
 *     the Worker. A key the deploy needs is not automatically a key the WORKER
 *     needs, and sending one anyway hands an internet-facing Worker a
 *     credential it never asks for.
 *   * `client: true` declarations, inlined into the browser bundle at build
 *     time and not Worker secrets at all (§A.6.3).
 *
 * ## ⚠️ Always the complete set
 *
 * `wrangler deploy --secrets-file` applies ADDITIVELY: it preserves every
 * secret it does not mention, which may be one another environment set. A
 * partial file inherits stale values silently rather than failing. So this
 * sends everything the app declares, every time, and `env audit`
 * reports whatever the Worker is still holding that nothing declares any more.
 *
 * ## Minted keys are refused, not filled
 *
 * A `secrecy: "secret"` key `storableKeys()` excludes is "minted": signed at
 * deploy time rather than stored anywhere, which is what `SANDBOX_PROXY_TOKEN`
 * is declared as. This has no minter of its own — there is nothing in
 * this repository that produces one — so a declared minted key is always a
 * hard failure here rather than a silent omission: a Worker that expects a
 * value substituted fails loudly at the file it never got, not at whatever
 * reads it.
 *
 * ## Cleanup
 *
 * `deploy <app>` removes the directory when the upload is done. The legacy
 * step writes `dir=` and `file=` to `$GITHUB_OUTPUT` and the workflow removes
 * `dir` in an `if: always()` step.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertRegistryLoaded } from "@devdogsuga/cli-core/env/discovery";
import { getEnvSync } from "@devdogsuga/cli-core/repo/peers";
import { DeployError, say, summary } from "./report.js";

export interface SecretsFileOptions {
  /** The workspace app whose manifest names the Worker's secrets. */
  app: string;
  /** Defaults to the ambient environment; a parameter so tests need not mutate it. */
  env?: NodeJS.ProcessEnv;
  /** Append `dir=`/`file=` to `$GITHUB_OUTPUT` for a later workflow step. Default true. */
  githubOutput?: boolean;
}

export interface SecretsFileResult {
  /** The 0700 directory holding the file; the caller removes it. */
  dir: string;
  /** The 0600 file itself. */
  file: string;
  /** Names sent, in registry order. Never values. */
  keys: string[];
  /** Declared, optional, and absent from the environment. Reported, not fatal. */
  omitted: string[];
}

export async function runDeploySecretsFile(
  options: SecretsFileOptions,
): Promise<SecretsFileResult> {
  assertRegistryLoaded();

  const { app } = options;
  const env = options.env ?? process.env;

  // The checkout's own copy of the library, which may predate the function.
  const { buildWorkerEnv } = getEnvSync() as Partial<
    ReturnType<typeof getEnvSync>
  >;
  if (buildWorkerEnv === undefined) {
    throw new DeployError(
      "This checkout's @devdogsuga/env is too old to build a Worker's environment.",
      ["Update it: buildWorkerEnv() arrived with the with-env release."],
    );
  }
  const built = buildWorkerEnv(app, env, "deploy");
  const send = new Map(Object.entries(built.env));
  const absent = built.absent;
  const minted = built.minted;

  // Absent is reported, not fatal. `deploy write-env` already failed the job
  // for anything an app's schema requires, so what reaches here is optional by
  // declaration, `OAUTH_CLIENT_SECRET` on a deployment that uses the built-in
  // provider, say. Sending an empty string instead would be worse than omitting
  // it: every consumer that checks for presence would read it as configured.
  if (absent.length > 0) {
    say([
      `deploy secrets-file: ${absent.length} optional key(s) have ` +
        `no value and are omitted: ${absent.join(", ")}`,
    ]);
  }

  if (minted.length > 0) {
    throw new DeployError(
      `${app} declares minted secret(s) with nothing to mint them: ${minted.join(", ")}.`,
      [
        "This command has no minter — nothing in this repository mints a",
        "secret. Drop the `minted: true` declaration from the app's",
        "env.ts, or the Worker deploys without it and keeps whatever the",
        "previous deploy left — --secrets-file preserves omissions.",
      ],
    );
  }

  if (send.size === 0) {
    throw new DeployError(`${app} has no Worker secrets to send.`, [
      "That is almost certainly wrong: a --secrets-file with nothing in it",
      "would leave every previously set secret in place, unexamined.",
    ]);
  }

  // mkdtemp gives 0700 on every platform Node supports; the mode is repeated
  // anyway so the intent survives a reader who does not know that. RUNNER_TEMP
  // is cleared between jobs on a hosted runner and is the documented place for
  // this on a self-hosted one.
  const dir = mkdtempSync(join(env.RUNNER_TEMP ?? tmpdir(), "deploy-secrets-"));
  const file = join(dir, `${app}.json`);
  writeFileSync(
    file,
    `${JSON.stringify(Object.fromEntries(send), null, 2)}\n`,
    { mode: 0o600 },
  );

  const out = env.GITHUB_OUTPUT;
  if (out && options.githubOutput !== false)
    writeFileSync(out, `dir=${dir}\nfile=${file}\n`, { flag: "a" });

  const keys = [...send.keys()];

  say([
    `deploy secrets-file: ${send.size} secret(s) for ${app} -> ${file}`,
    ...keys.map((k) => `  ${k}`),
  ]);

  // Names go to the job summary as well as the log, because this list IS every
  // credential the Worker holds. Reading it should not require expanding a
  // step: "why does this Worker hold that?" is exactly the question a
  // per-deploy record makes answerable, and the answer lives in the app's
  // manifest rather than anywhere in this pipeline.
  summary(
    [
      `### Worker secrets sent to \`${app}\``,
      "",
      ...keys.map((key) => `* \`${key}\``),
      "",
      "Names only. The complete set is sent every deploy, because",
      "`--secrets-file` preserves what it omits.",
      "",
      "",
    ],
    env,
  );

  return { dir, file, keys, omitted: absent };
}
