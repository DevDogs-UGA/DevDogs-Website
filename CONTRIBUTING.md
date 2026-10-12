# Contributing

Start with your project's contributing guide, not this file:

- [Platform](https://devdogsuga.org/docs/platform/guides/contributing)

Maintaining shared packages, CI, or deploys? See [Shared packages & tooling](https://devdogsuga.org/docs/toolkit).

Stuck, or something in the docs is wrong? Ask in [Discord](https://devdogsuga.org/discord) rather than guessing.

## Before you open a pull request

- Keep it small and focused on one change.
- Link the issue it closes.
- Update docs if you changed behavior.
- If you added or changed a migration, give it a fresh timestamp. The database types are generated locally (`pnpm --filter @devdogsuga/supabase run codegen`), not committed.
- Make sure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass locally.
