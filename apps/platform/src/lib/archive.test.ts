// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `archive/` is the one-time export of the Teams and competitions tables, with
 * a manifest of production's row counts taken when it was made. Production is
 * checked by `node scripts/archive-teams-and-competitions.ts --check`; this is
 * the half that needs no credentials: the files are the ones the manifest
 * hashed, their row counts are the manifest's, and nothing secret is in them.
 */

const ARCHIVE = join(import.meta.dirname, "..", "..", "..", "..", "archive");

const read = (name: string) => readFileSync(join(ARCHIVE, name), "utf8");

interface Manifest {
  tables: Record<string, { rows: number; file: string | null }>;
  files: Record<string, string>;
}

const manifest = JSON.parse(read("manifest.json")) as Manifest;
const teams = JSON.parse(read("teams.json")) as Array<{
  members: unknown[];
}>;
const competitions = JSON.parse(read("competitions.json")) as unknown[];
const entries = JSON.parse(read("competitionEntries.json")) as unknown[];

describe("archive/", () => {
  it("holds the files the manifest hashed", () => {
    for (const [name, hash] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(read(name)).digest("hex"), name).toBe(
        hash,
      );
    }
  });

  it("has the row counts production had", () => {
    expect(teams).toHaveLength(manifest.tables.teams!.rows);
    expect(teams.reduce((n, team) => n + team.members.length, 0)).toBe(
      manifest.tables.teamMembers!.rows,
    );
    expect(competitions).toHaveLength(manifest.tables.competitions!.rows);
    expect(entries).toHaveLength(manifest.tables.competitionEntries!.rows);
  });

  it("records every table the drop migration drops", () => {
    expect(Object.keys(manifest.tables).sort()).toEqual([
      "competitionEntries",
      "competitions",
      "teamMembers",
      "teamMembershipRequests",
      "teams",
    ]);
  });

  it("leaves out join codes and user ids", () => {
    const everything = [
      read("teams.json"),
      read("competitions.json"),
      read("competitionEntries.json"),
    ].join("\n");
    expect(everything).not.toContain("joinCode");
    expect(everything).not.toContain("createdBy");
    expect(everything).not.toContain('"userId"');
  });
});
