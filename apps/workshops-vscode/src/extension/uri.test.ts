import { describe, expect, it } from "vitest";
import { canonicalRepo, parseLines, parseQuery, parseWorkshopUri } from "./uri.js";

const REPO = "repo=DevDogsUGA/Web-Workshops";

describe("canonicalRepo", () => {
  it("accepts the two workshop repos in any casing", () => {
    expect(canonicalRepo("devdogsuga/web-workshops")).toBe("DevDogsUGA/Web-Workshops");
    expect(canonicalRepo("DEVDOGSUGA/MOBILE-WORKSHOPS")).toBe("DevDogsUGA/Mobile-Workshops");
  });

  it("refuses everything else", () => {
    for (const repo of ["DevDogsUGA/Backstage", "evil/Web-Workshops", "DevDogsUGA/Web-Workshops/x", "", "DevDogsUGA/Web-Workshops.git"]) {
      expect(canonicalRepo(repo)).toBeUndefined();
    }
  });
});

describe("parseQuery", () => {
  it("keeps the first of a repeated key and leaves + and % alone", () => {
    const q = parseQuery("a=1&a=2&b=x+y%z&c");
    expect(q.get("a")).toBe("1");
    expect(q.get("b")).toBe("x+y%z");
    expect(q.get("c")).toBe("");
  });
});

describe("parseLines", () => {
  it("reads a single line or an inclusive range", () => {
    expect(parseLines("7")).toEqual({ start: 7, end: 7 });
    expect(parseLines("3-9")).toEqual({ start: 3, end: 9 });
  });
  it("refuses zero, reversed and junk ranges", () => {
    for (const bad of ["0", "9-3", "a-b", "1-", "-2", "1-2-3", ""]) expect(parseLines(bad)).toBeUndefined();
  });
});

describe("parseWorkshopUri /review", () => {
  it("parses every field", () => {
    const result = parseWorkshopUri(
      "/review",
      `${REPO}&to=02-supabase/03-insert&from=02-supabase/01-x&file=app/page.tsx&session=abc123`,
    );
    expect(result).toEqual({
      ok: true,
      link: {
        action: "review",
        repo: "DevDogsUGA/Web-Workshops",
        to: "02-supabase/03-insert",
        from: "02-supabase/01-x",
        file: "app/page.tsx",
        session: "abc123",
      },
    });
  });

  it("needs only repo and to, and canonicalises the repo", () => {
    const result = parseWorkshopUri("/review/", "repo=devdogsuga/mobile-workshops&to=t");
    expect(result).toEqual({
      ok: true,
      link: {
        action: "review",
        repo: "DevDogsUGA/Mobile-Workshops",
        to: "t",
        from: undefined,
        file: undefined,
        session: undefined,
      },
    });
  });

  it("refuses a missing or foreign repo before anything else", () => {
    expect(parseWorkshopUri("/review", "to=t").ok).toBe(false);
    const foreign = parseWorkshopUri("/review", "repo=evil/repo&to=t");
    expect(foreign).toMatchObject({ ok: false });
  });

  it("refuses a missing step or a control character in a tag", () => {
    expect(parseWorkshopUri("/review", REPO).ok).toBe(false);
    expect(parseWorkshopUri("/review", `${REPO}&to=a\nb`).ok).toBe(false);
    expect(parseWorkshopUri("/review", `${REPO}&to=t&from=a\u0000b`).ok).toBe(false);
  });

  it("passes a tag that looks like a flag through untouched (git gets it as refs/tags/…)", () => {
    const result = parseWorkshopUri("/review", `${REPO}&to=--upload-pack=x`);
    expect(result).toMatchObject({ ok: true, link: { to: "--upload-pack=x" } });
  });
});

describe("parseWorkshopUri /open", () => {
  it("parses a file with a line range", () => {
    expect(parseWorkshopUri("/open", `${REPO}&ref=w/02-a&file=src/x.ts&lines=4-9`)).toEqual({
      ok: true,
      link: {
        action: "open",
        repo: "DevDogsUGA/Web-Workshops",
        ref: "w/02-a",
        file: "src/x.ts",
        lines: { start: 4, end: 9 },
      },
    });
  });

  it("needs ref and file, and a valid range when one is given", () => {
    expect(parseWorkshopUri("/open", `${REPO}&file=a`).ok).toBe(false);
    expect(parseWorkshopUri("/open", `${REPO}&ref=t`).ok).toBe(false);
    expect(parseWorkshopUri("/open", `${REPO}&ref=t&file=a&lines=9-2`).ok).toBe(false);
    expect(parseWorkshopUri("/open", `${REPO}&ref=t&file=a`)).toMatchObject({
      ok: true,
      link: { lines: undefined },
    });
  });
});

describe("parseWorkshopUri unknown actions", () => {
  it("refuses them", () => {
    expect(parseWorkshopUri("/delete", `${REPO}&to=t`).ok).toBe(false);
    expect(parseWorkshopUri("", REPO).ok).toBe(false);
  });
});
