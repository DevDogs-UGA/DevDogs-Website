# archive

The last state of the platform's Teams and competitions tables, exported from
production once, before the tables were dropped (lane 3e of the platform
cleanup).

| File                      | From                                                |
| ------------------------- | --------------------------------------------------- |
| `competitions.json`       | `platform.competitions`                             |
| `competitionEntries.json` | `platform."competitionEntries"`, with team and slug |
| `teams.json`              | `platform.teams`, each with its `members`           |
| `manifest.json`           | row counts per table, redactions and file hashes    |

`manifest.json` records how many rows each of the five tables had in production
(`teams`, `teamMembers`, `teamMembershipRequests`, `competitions`,
`competitionEntries`). `teamMembers` live inside `teams.json`, and
`teamMembershipRequests` (transient invitations) are a count only.

This repository is public, so the files hold no more than the competition
archive page showed:

- `teams.joinCode` (a secret) and `teams.createdBy` are left out.
- A team member is named by public handle only when they had a public profile.
  Everyone else is a row with a null handle, so the counts still match.

The unredacted rows were written outside the repository, for officers.

## Reproducing and checking

```bash
# Export again (reads production through the read-only Management API)
node scripts/archive-teams-and-competitions.ts

# Verify the files against the manifest, and the manifest against production
node scripts/archive-teams-and-competitions.ts --check
```

Once the tables are dropped, `--check` verifies the files against the manifest
only. `apps/platform/src/lib/archive.test.ts` runs that part in CI.
