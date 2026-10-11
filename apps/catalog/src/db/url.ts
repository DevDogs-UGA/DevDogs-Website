/** The slice of the environment that names a database. */
export interface DatabaseEnv {
  readonly DEPLOY_ENV?: string;
  readonly DB_URL?: string;
  readonly HYPERDRIVE?: { readonly connectionString: string };
}

/**
 * The connection string for this Worker's database: the Hyperdrive binding when
 * there is one (staging and production), `DB_URL` in development, and an error
 * naming what is missing otherwise. A deployed Worker with no binding must not
 * fall back to a `DB_URL`, so a misconfigured deploy fails loudly instead of
 * connecting somewhere unintended.
 */
export function resolveDatabaseUrl(env: DatabaseEnv): string {
  if (env.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString;

  const tier = env.DEPLOY_ENV ?? "development";
  if (tier === "development") {
    if (env.DB_URL) return env.DB_URL;
    throw new Error(
      "The development catalog Worker has neither a HYPERDRIVE binding nor DB_URL. Start it through `pnpm dev` with DB_URL in .dev.vars, or provide DB_URL to wrangler dev with --var.",
    );
  }
  throw new Error(`The ${tier} catalog Worker has no HYPERDRIVE binding.`);
}
