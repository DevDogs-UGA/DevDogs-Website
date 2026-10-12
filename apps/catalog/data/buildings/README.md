# Building coordinates

The registrar's schedule files name a building by number (`0024`); this folder
says where it is. The catalog imports it into `schedule_builder.buildings` at the
start of every scrape, and the API returns `address`, `lat` and `lon` with every
meeting that has a building.

## Credit

`athens.csv`, `griffin.csv` and `tifton.csv` come from the building data compiled
by **ArshadRM** for DevDogs' Optimal Schedule Builder (OSB commit `1b469a46`,
2025-02-11, "Got the real building data as referenced from #482"): Athens as the
OSB's course-information service shipped it, and the Griffin and Tifton campuses
from its algorithm prototype. `scripts/convert-osb-buildings.ts` records how they
were turned into these files (leading zeros dropped, `NCRR` and `TBA` removed,
repeated entries collapsed, Meigs Hall's copy-pasted point replaced).

## Files

| File                        | What                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `athens.csv`                | Athens, a point for every building                                                   |
| `griffin.csv`, `tifton.csv` | The other two campuses                                                               |
| `gaps/gap-NNN.csv`          | Buildings the registrar uses that no dataset has a point for. **You fill these in.** |
| `registrar-buildings.csv`   | Every building number the registrar's files use today, with how many meetings use it |

Columns: `id` (the registrar's number as an integer: `0024` is `24`), `campus`,
`name`, `address` (may be empty), `latitude`, `longitude`. A gap file also has
`meetings`, which is a hint to fill the biggest ones first.

## Filling a gap

1. Find the building: its row in a gap file has the registrar's name and how many
   meetings are held there.
2. Add `address`, `latitude` and `longitude` (decimal degrees, latitude first;
   longitude is negative in Georgia). Leave a row empty if you do not know.
3. `pnpm -F catalog check:buildings` and open a pull request. CI runs the same
   check.

A new file in `gaps/` must also be listed in `src/buildings/files.ts`, which
bundles the data into the Worker; the check fails with the line to add.

## The check

`pnpm -F catalog check:buildings` fails when:

- an id in a gap file is not one the registrar uses (a typo would add a building
  nothing refers to),
- a point is outside the bounding box of its campus (`src/buildings/dataset.ts`:
  Athens, Griffin, Tifton, Gwinnett, Atlanta, Skidaway, and a box for the rest of
  Georgia),
- an id appears twice, in one file or across files,
- a row is malformed, or gives only one coordinate,
- a CSV in this folder is not bundled by `files.ts`.

It prints the coverage: how many of the registrar's buildings, and of their
meetings, now have a point. After a scrape, the same figure for each term is in
that run's report (`uga."scrapeRuns"`).
