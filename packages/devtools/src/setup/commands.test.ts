import { describe, expect, it } from "vitest";
import { localNextSteps } from "./commands.js";

describe("localNextSteps", () => {
  it("lists the database steps db reset used to chain, in order", () => {
    const text = localNextSteps(["platform", "schedule-builder"]);
    const order = [
      "pnpm devtools supabase start",
      "pnpm devtools supabase db reset",
      "pnpm -F @devdogsuga/supabase types:db",
      "pnpm devtools supabase seed buckets",
      "pnpm devtools oauth",
      "pnpm -F platform dev",
      "pnpm -F schedule-builder dev",
      "pnpm devtools cron run --app platform --cron '*/15 * * * *'",
      "pnpm -F schedule-builder populate:courses",
    ].map((command) => text.indexOf(command));

    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("numbers the steps and says the docs index needs none", () => {
    const text = localNextSteps(["platform"]);
    expect(text).toMatch(/^1\. /);
    expect(text).toContain("indexes the docs search by itself");
    expect(text).not.toMatch(/populate:search/);
  });

  it("leaves out a step for an app that was not picked", () => {
    const text = localNextSteps(["platform"]);
    expect(text).toContain("cron run --app platform");
    expect(text).not.toContain("populate:courses");

    expect(localNextSteps(["schedule-builder"])).not.toContain(
      "cron run --app platform",
    );
  });

  it("lists every app-specific step when nothing was asked", () => {
    const text = localNextSteps(null);
    expect(text).toContain("cron run --app platform");
    expect(text).toContain("populate:courses");
  });

  it("no longer sends anyone to the db namespace", () => {
    expect(localNextSteps(null)).not.toMatch(/devtools db /);
  });
});
