/**
 * Unit tests for the pure helpers in `supabase-project.ts`:
 * `containerPrefix`, `foreignStackProjectId`, and `foreignStackMessage`.
 * `readProjectId` and `listContainerNames` are thin filesystem/subprocess
 * wrappers exercised indirectly through `db/generated-env.test.ts` and
 * `stack.test.ts`'s injected fakes, so they are not duplicated here.
 */
import { describe, expect, it } from "vitest";
import {
  containerPrefix,
  foreignStackMessage,
  foreignStackProjectId,
} from "./supabase-project.js";

describe("containerPrefix", () => {
  it("names the project-specific prefix when an id is known", () => {
    expect(containerPrefix("DevDogsUGA")).toBe("supabase_db_DevDogsUGA");
  });

  it("falls back to the bare prefix when the id is unreadable", () => {
    expect(containerPrefix(null)).toBe("supabase_db_");
  });
});

describe("foreignStackProjectId", () => {
  it("finds a supabase_db_<id> container whose id differs from ours", () => {
    expect(
      foreignStackProjectId(
        ["supabase_db_DevDogs-Website", "some_other_container"],
        "DevDogsUGA",
      ),
    ).toBe("DevDogs-Website");
  });

  it("returns null when every matching container is our own", () => {
    expect(
      foreignStackProjectId(["supabase_db_DevDogsUGA"], "DevDogsUGA"),
    ).toBeNull();
  });

  it("returns null when nothing matches the supabase_db_ shape at all", () => {
    expect(foreignStackProjectId(["postgres", "redis"], "DevDogsUGA")).toBeNull();
  });

  it("returns null when this project's own id could not be read — nothing to compare against", () => {
    expect(
      foreignStackProjectId(["supabase_db_DevDogs-Website"], null),
    ).toBeNull();
  });

  it("returns the first foreign id found, in name order", () => {
    expect(
      foreignStackProjectId(
        ["supabase_db_DevDogsUGA", "supabase_db_Other-Project"],
        "DevDogsUGA",
      ),
    ).toBe("Other-Project");
  });
});

describe("foreignStackMessage", () => {
  it("names the foreign project and the fix", () => {
    const message = foreignStackMessage("DevDogs-Website");
    expect(message).toContain('project "DevDogs-Website"');
    expect(message).toContain("supabase stop --project-id DevDogs-Website");
    expect(message).toContain("pnpm devtools db start");
  });
});
