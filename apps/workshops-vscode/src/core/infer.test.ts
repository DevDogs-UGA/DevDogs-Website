import { afterEach, describe, expect, it } from "vitest";
import { inferStepFromWorkingTree } from "./infer.js";
import { readStepLine } from "./tags.js";
import { TestRepo } from "./test-repo.js";

let repo: TestRepo | undefined;
afterEach(() => repo?.dispose());

const file = (...lines: string[]) => lines.join("\n") + "\n";

/** Three steps, each adding a distinct block of lines to app.ts. */
function build(): TestRepo {
  const r = TestRepo.init();
  const s1 = [
    "import alpha from 'alpha'",
    "const alphaValue = alpha.load()",
    "export default alphaValue",
  ];
  const s2 = [
    "const betaClient = createBeta(alphaValue)",
    "await betaClient.connect()",
    "console.log(betaClient.status)",
  ];
  const s3 = [
    "const gammaRows = await betaClient.query('gamma')",
    "render(gammaRows.map(toCard))",
    "gammaRows.forEach(track)",
  ];
  r.commit({ "app.ts": file("// start", "") });
  r.tag("w/00-start", "Start: w0");
  r.commit({ "app.ts": file("// start", ...s1) });
  r.tag("w/01-a", "A");
  r.commit({ "app.ts": file("// start", ...s1, ...s2) });
  r.tag("w/02-b", "B");
  r.commit({ "app.ts": file("// start", ...s1, ...s2, ...s3) });
  r.tag("w/03-c", "C");
  return r;
}

describe("inferStepFromWorkingTree", () => {
  it("finds the step a working tree matches, with high confidence", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/02-b");
    const guess = await inferStepFromWorkingTree(repo.dir, line);
    expect(guess.step.tag).toBe("w/02-b");
    expect(guess.confidence).toBeGreaterThan(0.9);
    expect(guess.guessedEarly).toBe(false);
  });

  it("finds the final step", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/03-c");
    expect((await inferStepFromWorkingTree(repo.dir, line)).step.tag).toBe(
      "w/03-c",
    );
  });

  it("falls back to the start when nothing matches", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/00-start");
    const guess = await inferStepFromWorkingTree(repo.dir, line);
    expect(guess.step.tag).toBe("w/00-start");
    expect(guess.confidence).toBeGreaterThan(0.9);
  });

  it("survives their own extra code", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/02-b");
    repo.write(
      "app.ts",
      repo.git("show", "w/02-b:app.ts") + "const mine = 42 // my addition\n",
    );
    expect((await inferStepFromWorkingTree(repo.dir, line)).step.tag).toBe(
      "w/02-b",
    );
  });

  it("guesses early when half of the next step is already there", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/02-b");
    // Two of step 3's three lines typed ahead: 67% of it is present.
    repo.write(
      "app.ts",
      repo.git("show", "w/02-b:app.ts") +
        "const gammaRows = await betaClient.query('gamma')\nrender(gammaRows.map(toCard))\n",
    );
    const guess = await inferStepFromWorkingTree(repo.dir, line);
    expect(guess.step.tag).not.toBe("w/03-c");
    expect(["w/01-a", "w/02-b"]).toContain(guess.step.tag);
  });

  it("steps back a step when the best match is doubtful", async () => {
    repo = build();
    const line = await readStepLine(repo.dir, "w");
    repo.git("switch", "-q", "--detach", "w/01-a");
    // Step 1 is fully there, but two of step 2's three lines are too: 0.67 of
    // the next step makes "step 1" doubtful, so the guess moves back to the start.
    repo.write(
      "app.ts",
      repo.git("show", "w/01-a:app.ts") +
        "const betaClient = createBeta(alphaValue)\nawait betaClient.connect()\nconst other = 1\n",
    );
    const guess = await inferStepFromWorkingTree(repo.dir, line);
    expect(guess.step.tag).toBe("w/00-start");
    expect(guess.guessedEarly).toBe(true);
    expect(guess.confidence).toBeLessThan(0.7);
  });
});
