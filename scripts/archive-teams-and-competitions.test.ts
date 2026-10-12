import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDrift } from "./archive-teams-and-competitions.ts";

// `--check` compares the archive with production row by row, not only by
// count (lane 3e review). The database half needs credentials, so this covers
// the comparison it relies on.
describe("describeDrift", () => {
  const archived = [
    {
      id: "a",
      slug: "test-2",
      name: "Test 2",
      githubSyncedAt: "t0",
      members: [{ leftAt: null }],
    },
    { id: "b", slug: "test", name: "Test", githubSyncedAt: "t0", members: [] },
  ];

  it("passes when only the GitHub sync stamp moved", () => {
    const live = archived.map((row) => ({ ...row, githubSyncedAt: "t1" }));
    assert.deepEqual(describeDrift("teams.json", archived, live), []);
  });

  it("catches a rename and a member's leftAt with the same row counts", () => {
    const live = [
      {
        ...archived[0]!,
        name: "Renamed",
        members: [{ leftAt: "2026-10-12" }],
      },
      archived[1]!,
    ];
    assert.deepEqual(describeDrift("teams.json", archived, live), [
      "teams.json: test-2 changed in production (name, members)",
    ]);
  });

  it("names rows production gained or lost, never their values", () => {
    const live = [archived[0]!, { id: "c", slug: "new", name: "secret" }];
    const problems = describeDrift("teams.json", archived, live);
    assert.deepEqual(problems, [
      "teams.json: production has a row the archive lacks (new)",
      "teams.json: the archive has a row production no longer has (test)",
    ]);
    assert.ok(!problems.join(" ").includes("secret"));
  });

  it("notices a reordering", () => {
    assert.deepEqual(
      describeDrift("teams.json", archived, [archived[1]!, archived[0]!]),
      ["teams.json: the rows are the same but their order differs"],
    );
  });
});
