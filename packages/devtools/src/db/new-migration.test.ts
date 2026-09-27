import { describe, expect, it } from "vitest";
import { migrationName } from "./new-migration.js";

describe("migrationName", () => {
  it("maps a hyphenated app slug to its underscored schema", () => {
    expect(migrationName("schedule-builder", "add widgets table")).toBe(
      "schedule_builder_add_widgets_table",
    );
    expect(migrationName("study-group-finder", "profile RLS")).toBe(
      "study_group_finder_profile_rls",
    );
    expect(migrationName("platform", "rate limits")).toBe(
      "platform_rate_limits",
    );
  });

  it("rejects an unknown app", () => {
    expect(migrationName("sandbox", "anything")).toBeNull();
  });

  it("rejects a description with nothing usable", () => {
    expect(migrationName("platform", "   ")).toBeNull();
  });
});
