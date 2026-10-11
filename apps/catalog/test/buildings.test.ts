import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkBuildingData } from "../scripts/check-buildings.ts";
import {
  parseBuildingCsv,
  validateBuildings,
  type ParsedBuildingFile,
} from "~/buildings/dataset";
import { buildingsToImport } from "~/buildings/importBuildings";
import { loadBuildingSources } from "../scripts/building-sources.ts";

/**
 * The building-data CI check (`pnpm check:buildings`): the id exists, the point
 * is inside its campus box, no id twice. The rules are tested on their own, then
 * the real files are held to them.
 */

const HEADER = "id,campus,name,address,latitude,longitude\n";
const KNOWN = new Set([24, 25, 4400]);

const parse = (file: string, rows: string[]): ParsedBuildingFile =>
  parseBuildingCsv(file, HEADER + rows.join("\n") + "\n");

const check = (files: ParsedBuildingFile[]) =>
  validateBuildings(files, {
    knownIds: KNOWN,
    requireKnownId: (file) => file.startsWith("gaps/"),
    allowEmptyCoordinates: (file) => file.startsWith("gaps/"),
  }).map((p) => p.message);

describe("validateBuildings", () => {
  it("accepts a clean file", () => {
    const athens = parse("athens.csv", [
      "24,athens,Meigs Hall,,33.9573,-83.3752",
    ]);
    expect(check([athens])).toEqual([]);
  });

  it("reads an id with a leading zero as the integer the registrar uses", () => {
    const file = parse("athens.csv", [
      "0024,athens,Meigs Hall,,33.9573,-83.3752",
    ]);
    expect(file.records).toHaveLength(1);
    // `buildings.id` is an integer: the dataset's `0024` is 24.
    expect(file.records[0]!.record.id).toBe(24);
  });

  it("rejects an id that is not a positive integer", () => {
    const file = parse("athens.csv", [
      "abc,athens,Nowhere,,33.9573,-83.3752",
      "-3,athens,Nowhere,,33.9573,-83.3752",
    ]);
    expect(file.problems.map((p) => p.message)).toEqual([
      expect.stringContaining("is not a positive integer"),
      expect.stringContaining("is not a positive integer"),
    ]);
  });

  it("rejects, in a member-edited gap file, an id the registrar does not use", () => {
    const gap = parse("gaps/gap-001.csv", ["9999,athens,Ghost,,33.95,-83.37"]);
    expect(check([gap])).toEqual([
      expect.stringContaining("is not a building the registrar uses"),
    ]);
  });

  it("rejects a point outside the bounding box of its campus", () => {
    // Longitude without its minus sign: east of Georgia.
    const flipped = parse("athens.csv", [
      "24,athens,Meigs Hall,,33.9573,83.3752",
    ]);
    // The Griffin building's point filed under Athens.
    const wrongCampus = parse("griffin.csv", [
      "25,athens,Moore College,,33.2655,-84.2800",
    ]);
    expect(check([flipped])).toEqual([
      expect.stringContaining("outside the athens bounding box"),
    ]);
    expect(check([wrongCampus])).toEqual([
      expect.stringContaining("outside the athens bounding box"),
    ]);
  });

  it("checks a point against its own campus's box, not Athens's", () => {
    const griffin = parse("griffin.csv", [
      "4400,griffin,Griffin SLC,,33.2655,-84.2800",
    ]);
    expect(check([griffin])).toEqual([]);
  });

  it("rejects an unknown campus", () => {
    const file = parse("athens.csv", ["24,mars,Meigs Hall,,33.9573,-83.3752"]);
    expect(check([file])).toEqual([
      expect.stringContaining('campus "mars" is not one of'),
    ]);
  });

  it("rejects an id twice, in one file and across files", () => {
    const athens = parse("athens.csv", [
      "24,athens,Meigs Hall,,33.9573,-83.3752",
      "24,athens,Meigs Hall again,,33.9573,-83.3752",
    ]);
    const gap = parse("gaps/gap-001.csv", [
      "24,athens,Meigs Hall,,33.9573,-83.3752",
    ]);
    expect(check([athens, gap])).toEqual([
      expect.stringContaining("id 24 is already in athens.csv line 2"),
      expect.stringContaining("id 24 is already in athens.csv line 2"),
    ]);
  });

  it("requires a point in the main datasets and allows a gap file to leave it empty", () => {
    const athens = parse("athens.csv", ["24,athens,Meigs Hall,,,"]);
    const gap = parse("gaps/gap-001.csv", ["25,athens,Moore College,,,"]);
    expect(check([athens])).toEqual(["latitude and longitude are empty."]);
    expect(check([gap])).toEqual([]);
  });

  it("rejects a half-filled point", () => {
    const gap = parse("gaps/gap-001.csv", ["25,athens,Moore College,,33.95,"]);
    expect(check([gap])).toEqual([
      "give both latitude and longitude, or neither.",
    ]);
  });
});

describe("checkBuildingData on a copy of the data", () => {
  let dir: string;
  const real = resolve(import.meta.dirname, "../data/buildings");
  const filesTs = readFileSync(
    resolve(import.meta.dirname, "../src/buildings/files.ts"),
    "utf8",
  );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "catalog-buildings-"));
    cpSync(real, dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes on the real data", () => {
    expect(checkBuildingData(real, filesTs).problems).toEqual([]);
  });

  it("flags a point moved outside its box", () => {
    const athens = readFileSync(join(dir, "athens.csv"), "utf8").split("\n");
    athens[1] = athens[1]!.replace(/,[-\d.]+$/, ",83.37");
    writeFileSync(join(dir, "athens.csv"), athens.join("\n"));
    const { problems } = checkBuildingData(dir, filesTs);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /athens\.csv:2.*outside the athens bounding box/,
    );
  });

  it("flags a duplicated id", () => {
    const athens = readFileSync(join(dir, "athens.csv"), "utf8").split("\n");
    athens.splice(2, 0, athens[1]!);
    writeFileSync(join(dir, "athens.csv"), athens.join("\n"));
    expect(checkBuildingData(dir, filesTs).problems.join("\n")).toMatch(
      /is already in athens\.csv line 2/,
    );
  });

  it("flags a gap-file id the registrar does not use", () => {
    writeFileSync(
      join(dir, "gaps/gap-002.csv"),
      "id,campus,name,address,latitude,longitude\n999999,athens,Ghost,,33.95,-83.37\n",
    );
    expect(checkBuildingData(dir, filesTs).problems.join("\n")).toMatch(
      /id 999999 is not a building the registrar uses/,
    );
  });

  it("flags a gap file the Worker would not bundle", () => {
    writeFileSync(
      join(dir, "gaps/gap-003.csv"),
      "id,campus,name,address,latitude,longitude\n",
    );
    expect(checkBuildingData(dir, filesTs).problems).toEqual([
      expect.stringContaining("gaps/gap-003.csv is not bundled"),
    ]);
  });
});

describe("buildingsToImport", () => {
  it("imports every placed building from the real files, and only those", () => {
    const placed = buildingsToImport(loadBuildingSources());
    expect(placed.length).toBeGreaterThan(250);
    expect(
      placed.every((b) => b.latitude !== null && b.longitude !== null),
    ).toBe(true);
    expect(new Set(placed.map((b) => b.id)).size).toBe(placed.length);
  });

  it("throws, rather than import, when the files do not validate", () => {
    const sources = loadBuildingSources();
    expect(() =>
      buildingsToImport({
        ...sources,
        files: {
          ...sources.files,
          "athens.csv": HEADER + "24,athens,Meigs Hall,,33.9573,83.3752\n",
        },
      }),
    ).toThrow(/does not validate/);
  });
});
