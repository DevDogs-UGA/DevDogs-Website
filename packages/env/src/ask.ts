/**
 * The interactive half of session resolution, shared by `with-env` and the
 * devtools launcher so both ask the same questions the same way.
 *
 * `resolveSessionTier` (in `session.ts`) is the policy; this wires it to a
 * terminal. It adds the one thing the policy deliberately leaves out: which
 * development database a contributor picked can be REMEMBERED, as a
 * `DEV_DB=local|remote` line in the development env file (`.env`). The first
 * time development is ambiguous (`.env` names a `DB_URL` and the local stack
 * is the other option), the picker asks local or remote, then "Remember my
 * decision" or "Just this once". Remembering writes the line; just this once
 * writes nothing, so the next run asks again. Deleting the line forgets.
 *
 * A remembered value counts exactly like an exported `DEV_DB`, which still
 * wins over it: a shell export or a parent session's answer is the more
 * specific choice.
 *
 * Off a terminal the callers differ, which is what `unanswered` says.
 * `with-env` fronts `pnpm -r` and CI, so with nothing remembered it lets the
 * local-stack probe decide, as it always has. The devtools launcher refuses
 * and asks for `--tier development:local|remote`.
 *
 * ⚠️ Node-only, like the rest of `session.ts`, and kept out of `index.ts` for
 * the same reason. `@clack/prompts` is imported only when a question is
 * actually shown: `with-env` runs this on every script, and the remembered
 * value is read with `parseRawAssignments` rather than dotenvx for the same
 * reason (see the import-cost note at the top of `cli.ts`).
 */
import { DEV_DB_ENV, parseRawAssignments, probeLocalStack } from "./load.js";
import type { DevDatabase } from "./load.js";
import {
  developmentRemoteCandidate,
  resolveSessionTier,
  type SessionTierResolution,
  type TierChoice,
} from "./session.js";
import { fileFor, type DeployEnvironment } from "./targets.js";

export interface AskSessionOptions {
  /** The repo root, where `.env` lives. */
  root: string;
  /** An explicit `--tier` value, or `undefined`. */
  explicit: string | undefined;
  /** Raw `DEPLOY_ENV`. */
  deployEnv: string | undefined;
  /** Raw exported `DEV_DB`. Beats a remembered one. */
  devDb: string | undefined;
  /** From `availableTiers()`. */
  available: DeployEnvironment[];
  /** Whether someone can answer a question. The caller decides what that
   * means for it (`with-env` also needs stdout to be a terminal). */
  canAsk: boolean;
  /** With nobody to ask and nothing remembered, whether an ambiguous
   * development falls to the local-stack probe or is refused. */
  unanswered: "probe" | "refuse";
  /** Prefix for the stderr line that reports a remembered decision. */
  name: string;
  /** Called on Ctrl-C at a question. Defaults to "Cancelled." and exit 1. */
  onCancel?: () => never;
}

/**
 * Resolves the session, asking on a terminal and offering to remember the
 * development database. Returns the same result `resolveSessionTier` does.
 */
export async function askSession(
  opts: AskSessionOptions,
): Promise<SessionTierResolution> {
  const exported = nonEmpty(opts.devDb);
  const devDb = exported ?? (await rememberedDevDatabase(opts.root));

  // The `.env` lookup and the port probe are only paid when the session could
  // land on bare development with no database chosen.
  const deployEnv = nonEmpty(opts.deployEnv);
  const couldBeBareDevelopment =
    devDb === undefined &&
    (opts.explicit === "development" ||
      (opts.explicit === undefined &&
        (deployEnv === undefined || deployEnv === "development")));
  const remoteCandidate =
    couldBeBareDevelopment && (opts.canAsk || opts.unanswered === "refuse")
      ? await developmentRemoteCandidate(opts.root)
      : undefined;
  const localStackOnline =
    typeof remoteCandidate === "string" ? await probeLocalStack() : undefined;

  let asked = false;
  const resolution = await resolveSessionTier({
    explicit: opts.explicit,
    deployEnv: opts.deployEnv,
    devDb,
    available: opts.available,
    isTTY: opts.canAsk,
    remoteCandidate,
    localStackOnline,
    promptMessage: "Which environment should this session use?",
    ...(opts.canAsk && {
      prompt: async (message: string, choices: TierChoice[]) => {
        asked = true;
        return choose(message, choices, opts.onCancel);
      },
    }),
  });

  if (resolution.ok && asked && resolution.devDatabase !== undefined) {
    const remember = await choose<boolean>(
      `Use the ${resolution.devDatabase} database from now on?`,
      [
        {
          value: true,
          label: "Remember my decision",
          hint: `saves ${DEV_DB_ENV}=${resolution.devDatabase} to ${fileFor("development")}`,
        },
        { value: false, label: "Just this once" },
      ],
      opts.onCancel,
    );
    if (remember) {
      await rememberDevDatabase(opts.root, resolution.devDatabase);
      process.stderr.write(
        `${opts.name}: saved ${DEV_DB_ENV}=${resolution.devDatabase} to ` +
          `${fileFor("development")}; delete that line to be asked again.\n`,
      );
    }
  }
  return resolution;
}

/**
 * The `DEV_DB` the development env file remembers, raw (an invalid value is
 * passed on so `resolveSessionTier` refuses it by name), or `undefined`.
 */
export async function rememberedDevDatabase(
  root: string,
): Promise<string | undefined> {
  const text = await readDevelopmentFile(root);
  if (text === undefined) return undefined;
  return nonEmpty(parseRawAssignments(text).get(DEV_DB_ENV)?.raw);
}

/** Writes `DEV_DB=<db>` to the development env file, replacing a line that
 * is already there. The file keeps its mode. */
export async function rememberDevDatabase(
  root: string,
  db: DevDatabase,
): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const text = (await readDevelopmentFile(root)) ?? "";
  const line = `${DEV_DB_ENV}=${db}`;
  const existing = new RegExp(
    `^[ \\t]*(?:export[ \\t]+)?${DEV_DB_ENV}[ \\t]*=.*$`,
    "m",
  );
  const next = existing.test(text)
    ? text.replace(existing, line)
    : `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}` +
      `\n# Which development database to use (local or remote). Delete to be asked again.\n${line}\n`;
  await writeFile(join(root, fileFor("development")), next, { mode: 0o600 });
}

async function readDevelopmentFile(root: string): Promise<string | undefined> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    return await readFile(join(root, fileFor("development")), "utf8");
  } catch {
    return undefined;
  }
}

async function choose<T>(
  message: string,
  options: { value: T; label: string; hint?: string }[],
  onCancel: (() => never) | undefined,
): Promise<T> {
  const { cancel, isCancel, select } = await import("@clack/prompts");
  // clack's option type is a conditional over T; the cast keeps this generic.
  const choice = await select<T>({
    message,
    options: options as Parameters<typeof select<T>>[0]["options"],
  });
  if (isCancel(choice)) {
    if (onCancel) onCancel();
    cancel("Cancelled.");
    process.exit(1);
  }
  return choice;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}
