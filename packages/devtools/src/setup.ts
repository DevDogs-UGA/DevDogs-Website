/**
 * One-command onboarding, the first thing a new contributor runs.
 *
 * Hosted Supabase (a student's own free-tier project) is the DEFAULT path:
 * pick app(s) -> hosted or local -> prerequisite checks -> for hosted, a
 * short wizard collects the project's URL and keys, validates the DB_URL,
 * writes `.env`, runs the migrations, and chains straight into `devtools
 * oauth` against that same project. Local keeps today's `db start` flow
 * unchanged.
 *
 * Was `scripts/setup.ts` at the repo root, resolving paths from
 * `process.cwd()`, so it only worked when invoked from the root. Same class of
 * bug that made the Supabase CLI look for `supabase_db_platform`. It resolves
 * from `findRepoRoot()` now and works from anywhere.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { confirm, log, note, password, select, spinner, text } from "@clack/prompts";
import { loadRegistry } from "./env/discovery.js";
import { renderInit, resolveSections } from "./env/example.js";
import { discoverRepoRoot } from "./repo/root.js";
import { EnvDocument } from "./env/document.js";
import { dbPush } from "./db/run.js";
import { validateSessionPoolerUrl } from "./db/pooler.js";
import { runOAuthSetup } from "./oauth/wizard.js";
import type { ConnectTarget } from "./oauth/target.js";
import { runEnvironmentDoctor } from "./environment-doctor.js";
import { unwrap } from "./ui.js";

function has(cmd: string, args: string[] = ["--version"]): string | null {
  try {
    return execFileSync(cmd, args, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

/** Reads `packageManager` out of a checkout's root `package.json`, when one
 * is reachable — for the "does the installed pnpm match the pin" line. */
function readPnpmPin(repoRoot: string | null): string | null {
  if (!repoRoot) return null;
  try {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { packageManager?: string };
    return pkg.packageManager?.replace(/^pnpm@/, "").split("+")[0] ?? null;
  } catch {
    return null;
  }
}

export async function runSetup(): Promise<void> {
  const checks: string[] = [];

  // ── Prerequisites ──────────────────────────────────────────────────────────
  //
  // Optional tools report as information rather than warnings. A contributor
  // without Flutter is not misconfigured; they are just not working on the
  // Flutter app, and saying otherwise trains people to ignore the output.

  const node = process.versions.node;
  // The floor is 22.12, not the .nvmrc pin (24): pnpm 11 needs node:sqlite,
  // which appeared in 22.5 and went LTS-stable at 22.12. CI's first-ever run
  // failed on exactly this, with Node 20 from the old pin.
  const [major = 0, minor = 0] = node.split(".").map(Number);
  checks.push(
    major > 22 || (major === 22 && minor >= 12)
      ? `OK    Node ${node}`
      : `WARN  Node ${node} — this repo needs >= 22.12 for pnpm 11 (see .nvmrc)`,
  );

  // Never corepack — this repo does not use it. Node via fnm, then `npm
  // install -g pnpm`; pnpm self-switches to the pinned version on its first
  // run here (pmOnFail=download).
  const pnpmVersion = has("pnpm");
  const repoRootForPin = discoverRepoRoot();
  const pin = readPnpmPin(repoRootForPin);
  if (!pnpmVersion) {
    checks.push(
      "WARN  pnpm not found — run `npm install -g pnpm` (never `corepack enable`)",
    );
  } else if (pin && pnpmVersion !== pin) {
    checks.push(
      `WARN  pnpm ${pnpmVersion} — this repo is pinned to ${pin}; any pnpm command here self-switches`,
    );
  } else {
    checks.push(`OK    pnpm ${pnpmVersion}`);
  }

  checks.push(
    has("flutter", ["--version"])
      ? "OK    Flutter installed (study-group-finder buildable)"
      : "INFO  Flutter not installed — only needed for apps/study-group-finder",
  );

  // ── No repo yet? ───────────────────────────────────────────────────────────
  //
  // `discoverRepoRoot()` (the non-throwing lookup — see `repo/root.ts`)
  // rather than `findRepoRoot()`: per the carve-out plan's §5,
  // `pnpm dlx @devdogsuga/devtools setup` is meant to work PRE-CLONE, run
  // from wherever a contributor happens to be before they have a checkout
  // at all. The prerequisite checks above need no repo either way; only the
  // `.env`-seeding half below does, so that's the only part skipped here.
  const repoRoot = discoverRepoRoot();
  if (repoRoot === null) {
    note(checks.join("\n"), "Prerequisites");
    note(
      [
        "No DevDogsUGA checkout found in this directory or its parents.",
        "",
        "1. git clone https://github.com/devdogsuga/DevDogsUGA.git",
        "2. cd DevDogsUGA && pnpm install",
        "3. pnpm devtools setup   — run again from inside the clone to seed .env",
      ].join("\n"),
      "Next steps",
    );
    return;
  }

  note(checks.join("\n"), "Prerequisites");

  // ── Env ────────────────────────────────────────────────────────────────────

  const env = join(repoRoot, ".env");
  let chosenApps: string[] | null = null;

  if (existsSync(env)) {
    log.info("OK    .env already exists (left untouched)");
  } else {
    await loadRegistry();
    const sections = await resolveSections();
    if (sections) {
      const order = [
        "schedule-builder",
        "study-group-finder",
        "platform",
        "sandbox",
      ];
      chosenApps = order.filter((app) => sections.has(app));
    }
    writeFileSync(
      env,
      renderInit(
        "development",
        new Date().toISOString().slice(0, 10),
        sections,
      ),
      { flag: "wx" },
    );
    log.success("Created .env (same as `pnpm devtools env init`)");
    log.info(
      ".env starts blank. Supabase on this machine fills the connection block " +
        "for you; only a hosted project needs values typed in.",
    );
  }

  // ── Local or hosted? ────────────────────────────────────────────────────────

  const target = unwrap(
    await select({
      message: "Which Supabase should this checkout use?",
      options: [
        {
          value: "hosted" as const,
          label: "Hosted (your own free-tier project)",
          hint: "recommended — set one up at supabase.com in a couple of minutes",
        },
        {
          value: "local" as const,
          label: "Local (Docker)",
          hint: "needs Docker Desktop, OrbStack, or Docker Engine in WSL2",
        },
      ],
      initialValue: "hosted" as const,
    }),
  );

  if (target === "hosted") {
    await runHostedWizard(repoRoot);
  } else {
    printLocalNextSteps(chosenApps);
  }

  // Every path ends the same way: a read-only check of what just happened.
  await runEnvironmentDoctor({});
}

function printLocalNextSteps(chosenApps: string[] | null): void {
  const startSteps =
    chosenApps && chosenApps.length > 0
      ? chosenApps.map((app) =>
          app === "study-group-finder"
            ? `     pnpm dev --filter study-group-finder   (Flutter — needs the SDK)`
            : `     pnpm dev --filter ${app}`,
        )
      : ["     pnpm dev   — then pick your app from the list"];

  note(
    [
      "1. Run `pnpm devtools` again and choose:",
      "     Database → start   — boots the local Docker stack and writes",
      "                          .env.generated (no credentials needed)",
      "",
      '2. Choose Workspace → oauth to configure "Sign in with DevDogs"',
      "   after the local database is running. Every app signs in through",
      "   platform's OAuth server, so this step is shared no matter which",
      "   project you are building.",
      "",
      "3. Start the project you picked:",
      ...startSteps,
      ...(chosenApps?.includes("schedule-builder")
        ? [
            "",
            "   schedule-builder starts with an empty catalog. Populate it by",
            "   triggering the registrar scrape workflow (starts Wrangler for you):",
            "     pnpm devtools workflows run --app schedule-builder --tier development",
          ]
        : []),
    ].join("\n"),
    "Next steps",
  );
}

/**
 * The hosted onboarding wizard: create a project on supabase.com by hand
 * (this only asks for what comes out of it), then API URL, publishable key,
 * secret key, and the Session pooler DB_URL — validated before anything is
 * written. Non-clobbering: an already-filled key is left alone unless the
 * contributor confirms overwriting it.
 */
async function runHostedWizard(repoRoot: string): Promise<void> {
  note(
    [
      "1. Create a free project at https://supabase.com/dashboard",
      "2. Project Settings → API: copy the Project URL, the publishable key,",
      "   and the secret key.",
      "3. Project Settings → Database → Connection string → Session pooler:",
      "   copy that string (port 5432, not 6543).",
    ].join("\n"),
    "Create a hosted Supabase project",
  );

  const envPath = join(repoRoot, ".env");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const doc = EnvDocument.parse(existing);

  const apiUrl = await promptEnvValue(doc, "API_URL", "Project URL", "https://<ref>.supabase.co");
  const publishableKey = await promptEnvValue(
    doc,
    "PUBLISHABLE_KEY",
    "Publishable key",
    "sb_publishable_...",
  );
  const secretKey = await promptSecretValue(doc, "SECRET_KEY", "Secret key");

  let dbUrl: string;
  for (;;) {
    const candidate = await promptSecretValue(doc, "DB_URL", "Session pooler DB_URL");
    const validation = validateSessionPoolerUrl(candidate);
    if (validation.ok) {
      dbUrl = candidate;
      break;
    }
    log.error(validation.message ?? "That DB_URL is not usable.");
    if (validation.faqId) {
      log.info(
        `https://devdogsuga.org/docs/platform/getting-started/troubleshooting#${validation.faqId}`,
      );
    }
    doc.set("DB_URL", ""); // clear so the next loop iteration re-prompts
  }

  doc.set("API_URL", apiUrl);
  doc.set("PUBLISHABLE_KEY", publishableKey);
  doc.set("SECRET_KEY", secretKey);
  doc.set("DB_URL", dbUrl);
  writeFileSync(envPath, doc.toString());
  log.success("Wrote .env");

  const s = spinner();
  s.start("Running migrations against your project");
  const code = await dbPush(dbUrl, { yes: true });
  if (code === 0) {
    s.stop("Migrations applied");
  } else {
    s.stop("Migrations failed — see the Supabase CLI output above");
    log.warn(
      "You can re-run this with `pnpm devtools db migrate` once it's fixed.",
    );
  }

  log.info('Now configuring "Sign in with DevDogs" against the same project.');
  const hostedTarget: ConnectTarget = {
    kind: "hosted",
    apiUrl,
    serviceRoleKey: secretKey,
  };
  await runOAuthSetup(undefined, undefined, undefined, hostedTarget);

  note(
    [
      "Add your app's localhost redirect URL in the dashboard:",
      "  Auth -> URL Configuration -> Redirect URLs -> add http://localhost:<port>/**",
      "",
      "Then:",
      "  pnpm dev",
    ].join("\n"),
    "Next steps",
  );
}

async function promptEnvValue(
  doc: EnvDocument,
  key: string,
  label: string,
  placeholder: string,
): Promise<string> {
  const current = doc.get(key);
  if (current) {
    const overwrite = unwrap(
      await confirm({
        message: `${label} is already set in .env. Overwrite it?`,
        initialValue: false,
      }),
    );
    if (!overwrite) return current;
  }
  return unwrap(
    await text({
      message: label,
      placeholder,
      validate: (v) => (v?.trim() ? undefined : "Required"),
    }),
  ).trim();
}

async function promptSecretValue(
  doc: EnvDocument,
  key: string,
  label: string,
): Promise<string> {
  const current = doc.get(key);
  if (current) {
    const overwrite = unwrap(
      await confirm({
        message: `${label} is already set in .env. Overwrite it?`,
        initialValue: false,
      }),
    );
    if (!overwrite) return current;
  }
  return unwrap(
    await password({
      message: label,
      validate: (v) => (v?.trim() ? undefined : "Required"),
    }),
  ).trim();
}
