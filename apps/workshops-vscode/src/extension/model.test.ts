import { describe, expect, it } from "vitest";
import type { ReviewPlan, Step } from "../core/index.js";
import {
  decideBase,
  planIsEmpty,
  rangeLabel,
  restrictPlanToFile,
  reviewTitle,
} from "./scope.js";
import { buildStepsModel, stepLabel } from "./steps-model.js";
import { resolveUsername } from "./username.js";
import { isPendingFresh, PENDING_TTL_MS, readPending } from "./pending.js";

function step(
  workshop: string,
  number: number,
  title = `Title ${number}`,
): Step {
  const nn = String(number).padStart(2, "0");
  return {
    tag: `${workshop}/${nn}-s${number}`,
    workshop,
    number,
    slug: `s${number}`,
    title,
    run: [],
    docs: undefined,
    commit: "c",
    start: undefined,
  };
}

const line = [
  step("01-a", 0),
  step("01-a", 1),
  step("01-a", 2),
  step("02-b", 0),
  step("02-b", 1),
  step("02-b", 2),
  step("02-b", 3),
];

describe("buildStepsModel", () => {
  it("skips 00-start markers and marks done, current and todo", () => {
    const model = buildStepsModel(line, line[5]!);
    expect(model.total).toBe(5);
    expect(model.position).toBe(4);
    expect(model.header).toBe("Step 4 of 5");
    expect(model.rows.map((r) => r.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "todo",
    ]);
  });

  it("reports not started when nothing (or only a start) is reached", () => {
    expect(buildStepsModel(line, null).header).toBe("Not started · 5 steps");
    expect(buildStepsModel(line, line[3]!).position).toBe(0);
  });

  it("labels steps with their number", () => {
    expect(stepLabel(step("w", 3, "Post it"))).toBe("03 Post it");
    expect(stepLabel({ ...step("w", 3, ""), slug: "post-it" })).toBe(
      "03 post-it",
    );
  });
});

describe("decideBase", () => {
  it("is up to date at or past the target", () => {
    expect(decideBase(line, line[2]!, line[2]!, false).kind).toBe("up-to-date");
    expect(decideBase(line, line[2]!, line[4]!, false).kind).toBe("up-to-date");
  });

  it("reviews the next step without asking", () => {
    expect(decideBase(line, line[2]!, line[1]!, false)).toEqual({
      kind: "ready",
      base: line[1],
    });
  });

  it("asks about a skipped range, offering the target's own step as the alternative", () => {
    expect(decideBase(line, line[6]!, line[2]!, false)).toEqual({
      kind: "ask-range",
      combined: line[2],
      single: line[5],
    });
  });

  it("honours an explicit from without asking", () => {
    expect(decideBase(line, line[6]!, line[2]!, true)).toEqual({
      kind: "ready",
      base: line[2],
    });
  });
});

describe("labels", () => {
  it("names one step, a range, and a range across workshops", () => {
    expect(rangeLabel([line[5]!])).toBe("Step 2");
    expect(rangeLabel([line[5]!, line[6]!])).toBe("Steps 2–3");
    expect(rangeLabel([line[2]!, line[4]!])).toBe("Steps 01-a/02 – 02-b/01");
    expect(reviewTitle([line[1]!, line[2]!])).toBe("Steps 1–2: Title 2");
  });
});

describe("restrictPlanToFile", () => {
  const plan: ReviewPlan = {
    base: line[1]!,
    target: line[2]!,
    steps: [line[2]!],
    commands: ["pnpm add x"],
    files: [
      { path: "a.ts", oldPath: undefined, status: "modified" },
      { path: "new.ts", oldPath: "old.ts", status: "renamed" },
    ],
    fromTarget: [
      {
        path: "pnpm-lock.yaml",
        oldPath: undefined,
        status: "modified",
        reason: "lockfile",
      },
    ],
  };

  it("keeps one file (either side of a rename) and drops commands", () => {
    expect(restrictPlanToFile(plan, "a.ts").files.map((f) => f.path)).toEqual([
      "a.ts",
    ]);
    expect(restrictPlanToFile(plan, "old.ts").files.map((f) => f.path)).toEqual(
      ["new.ts"],
    );
    expect(restrictPlanToFile(plan, "a.ts").commands).toEqual([]);
  });

  it("can come out empty", () => {
    expect(planIsEmpty(restrictPlanToFile(plan, "nope.ts"))).toBe(true);
    expect(planIsEmpty(plan)).toBe(false);
  });
});

describe("resolveUsername", () => {
  it("takes the first valid answer and skips failures and junk", async () => {
    const calls: string[] = [];
    const name = await resolveUsername([
      async () => (calls.push("a"), undefined),
      async () => (calls.push("b"), Promise.reject(new Error("no gh"))),
      async () => (calls.push("c"), "not a login!"),
      async () => (calls.push("d"), " sloanfinger\n"),
      async () => (calls.push("e"), "never"),
    ]);
    expect(name).toBe("sloanfinger");
    expect(calls).toEqual(["a", "b", "c", "d"]);
  });

  it("is undefined when nobody knows", async () => {
    expect(await resolveUsername([async () => undefined])).toBeUndefined();
  });
});

describe("pending links", () => {
  it("round-trips through storage and expires", () => {
    const pending = readPending({
      path: "/review",
      query: "a=b",
      savedAt: 1000,
    });
    expect(pending).toEqual({ path: "/review", query: "a=b", savedAt: 1000 });
    expect(isPendingFresh(pending!, 1000 + PENDING_TTL_MS)).toBe(true);
    expect(isPendingFresh(pending!, 1001 + PENDING_TTL_MS)).toBe(false);
    expect(isPendingFresh(pending!, 500)).toBe(false);
  });

  it("ignores garbage", () => {
    for (const raw of [
      undefined,
      null,
      "x",
      { path: 1 },
      { path: "/a", query: "", savedAt: "n" },
    ]) {
      expect(readPending(raw)).toBeUndefined();
    }
  });
});
