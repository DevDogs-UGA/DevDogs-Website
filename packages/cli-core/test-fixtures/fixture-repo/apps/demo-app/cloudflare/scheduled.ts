/**
 * Fixture scheduled-handler contract, matching devtools' `cron/schema.ts`
 * shape: `src/cron/discovery.ts` dynamically imports this file (a plain
 * `import()`, relying on Node's native TypeScript type-stripping — no `tsx`
 * needed for a file this simple) and validates `CRON_ROUTES` against it.
 */
export const CRON_ROUTES: Record<string, { routes: string[]; label: string }> =
  {
    "*/30 * * * *": {
      routes: ["/cron/demo-sync"],
      label: "Demo sync (every 30 minutes)",
    },
    "0 6 * * *": {
      routes: ["/cron/demo-sync"],
      label: "Demo sync (production, daily at 06:00 UTC)",
    },
  };
