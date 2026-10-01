/**
 * Unit tests for the pure helpers in `supabase-project.ts`:
 * `containerPrefix`, `foreignStackProjectId`, `foreignStackMessage`, and the
 * `docker ps` arguments `listContainerNames` builds. `readProjectId` is a thin
 * filesystem wrapper exercised through `db/generated-env.test.ts` and
 * `stack.test.ts`'s injected fakes.
 */
import { describe, expect, it } from "vitest";
import {
  containerPrefix,
  foreignStackMessage,
  foreignStackProjectId,
  listContainerNames,
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
  it("finds a supabase_kong_<id> container whose id differs from ours", () => {
    expect(
      foreignStackProjectId(
        ["supabase_kong_DevDogs-Website", "some_other_container"],
        "DevDogsUGA",
      ),
    ).toBe("DevDogs-Website");
  });

  it("returns null when every matching container is our own", () => {
    expect(
      foreignStackProjectId(["supabase_kong_DevDogsUGA"], "DevDogsUGA"),
    ).toBeNull();
  });

  it("returns null when nothing matches the supabase_kong_ shape at all", () => {
    expect(
      foreignStackProjectId(["postgres", "redis"], "DevDogsUGA"),
    ).toBeNull();
  });

  it("returns null when this project's own id could not be read — nothing to compare against", () => {
    expect(
      foreignStackProjectId(["supabase_kong_DevDogs-Website"], null),
    ).toBeNull();
  });

  it("returns the first foreign id found, in name order", () => {
    expect(
      foreignStackProjectId(
        ["supabase_kong_DevDogsUGA", "supabase_kong_Other-Project"],
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

describe("listContainerNames", () => {
  it("filters to the containers publishing a port when given one", () => {
    const calls: string[][] = [];
    const names = listContainerNames(54321, (_file, args) => {
      calls.push(args);
      return "supabase_kong_DevDogs-Website\n";
    });
    expect(calls[0]).toEqual([
      "ps",
      "--filter",
      "publish=54321",
      "--format",
      "{{.Names}}",
    ]);
    expect(names).toEqual(["supabase_kong_DevDogs-Website"]);
  });

  it("lists every container without a port, and null when Docker fails", () => {
    const calls: string[][] = [];
    listContainerNames(undefined, (_file, args) => {
      calls.push(args);
      return "";
    });
    expect(calls[0]).toEqual(["ps", "--format", "{{.Names}}"]);
    expect(listContainerNames(54321, () => null)).toBeNull();
  });
});
