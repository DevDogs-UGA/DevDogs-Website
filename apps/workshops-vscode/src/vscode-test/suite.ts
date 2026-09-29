import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { WorkshopsApi } from "../extension/extension";

/**
 * Runs inside a real VS Code (see run.ts). One scenario, top to bottom, the
 * way an attendee does it from a docs link: the panel lists the steps, a
 * `/review` link opens a review to step 1, the step's command runs in the
 * Workshop terminal, files open in diff editors, most changes are accepted and
 * one rejected, and Finish records a merge commit.
 */

const clone = process.env["SMOKE_CLONE"]!;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", clone, ...args], { encoding: "utf8" }).trim();

async function until<T>(what: string, check: () => T | undefined | false, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const log = (message: string) => console.log(`[smoke] ${message}`);

/** Optional: SMOKE_SHOT=<dir> saves screenshots of the virtual display (needs python3 + Pillow). */
async function shot(name: string): Promise<void> {
  const dir = process.env["SMOKE_SHOT"];
  if (!dir) return;
  await new Promise((r) => setTimeout(r, 2500));
  try {
    execFileSync("python3", [
      "-c",
      `from PIL import ImageGrab; ImageGrab.grab(xdisplay=None).save(${JSON.stringify(join(dir, `${name}.png`))})`,
    ]);
  } catch (error) {
    log(`screenshot failed: ${(error as Error).message.split("\n")[0]}`);
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<WorkshopsApi>("devdogsuga.workshops");
  assert.ok(extension, "extension devdogsuga.workshops is installed in the host");
  const api = await extension.activate();
  assert.equal(extension.isActive, true);
  log("activated");

  // The panel's step list.
  await api.steps.refresh();
  const open = api.steps.open;
  assert.ok(open, "the panel found the workspace clone");
  assert.equal(open.repo, "DevDogsUGA/Web-Workshops");
  const numbered = open.snapshot.line.filter((s) => s.number > 0).map((s) => s.tag);
  assert.deepEqual(numbered.slice(0, 2), ["02-supabase/01-read", "02-supabase/02-sign-in"]);
  assert.equal(open.snapshot.current?.tag, "02-supabase/00-start");
  log(`panel lists ${numbered.length} steps, current is 00-start`);

  // Refused links do nothing.
  await api.handleLink("/review", "repo=evil/Web-Workshops&to=02-supabase/01-read");
  assert.equal(api.review.snapshot, undefined);

  await api.setUsername("smoke-tester");
  const opened: string[] = [];
  api.review.openUrl = async (url) => void opened.push(url);
  const before = git("rev-parse", "HEAD");

  // The link path: /review?repo&to&session.
  await api.handleLink("/review", "repo=devdogsuga/web-workshops&to=02-supabase/01-read&session=smoke-session");
  const started = await until("review to open", () => api.review.snapshot);
  assert.equal(started.target, "02-supabase/01-read");
  assert.equal(started.phase, "commands");
  assert.deepEqual(started.commands.map((c) => c.command), ["echo ran > ran.txt"]);
  log("review opened with its command");

  // Step command in the Workshop terminal.
  await vscode.commands.executeCommand("devdogsWorkshops.review.runAllCommands");
  let state = api.review.snapshot!.commands[0]!.state;
  if (state === "sent") {
    log("no shell integration here: line was sent, confirming by hand");
    await vscode.commands.executeCommand("devdogsWorkshops.review.confirmCommand", 0);
  } else {
    log(`command finished via shell integration: ${state}`);
  }
  await until("command result", () => api.review.snapshot!.phase === "files" || undefined);
  if (state === "done") await until("ran.txt", () => existsSync(join(clone, "ran.txt")) || undefined, 15_000);
  state = api.review.snapshot!.commands[0]!.state;
  assert.equal(state, "done");

  // Files and diff editors.
  const files = api.review.snapshot!.files;
  assert.ok(files.length > 0, "the step has files to review");
  assert.ok(files.every((f) => f.status === "pending"));
  await until("a review diff tab", () =>
    vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputTextDiff && t.input.modified.scheme === "devdogs-review"),
  );
  log(`${files.length} files to review, diff editor open: ${files.map((f) => `${f.path}(${f.changes})`).join(", ")}`);

  await shot("1-review-opened");

  // Accept everything except one change.
  // Prefer a file they already have, so "reject" visibly keeps their version.
  const existedBefore = (path: string) => {
    try {
      git("cat-file", "-e", `${before}:${path}`);
      return true;
    } catch {
      return false;
    }
  };
  const rejectIndex = files.findIndex((f) => existedBefore(f.path) && f.changes === 1);
  const target = rejectIndex >= 0 ? rejectIndex : files.length - 1;
  const rejected = files[target]!.path;
  await vscode.commands.executeCommand("devdogsWorkshops.review.acceptAll");
  api.review.decideChange(target, 0, "reject");
  assert.equal(api.review.snapshot!.files[target]!.status, files[target]!.changes === 1 ? "rejected" : "partial");
  const rejectedBefore = existedBefore(rejected) ? git("show", `${before}:${rejected}`) : null;

  await shot("2-after-decisions");
  await vscode.commands.executeCommand("devdogsWorkshops.review.finish");
  await until("review to finish", () => api.review.snapshot === undefined || undefined);

  // The merge commit.
  const tagCommit = git("rev-parse", "02-supabase/01-read^{commit}");
  const parents = git("rev-list", "--parents", "-n1", "HEAD").split(" ").slice(1);
  assert.deepEqual(parents, [before, tagCommit], "HEAD is a merge of the old HEAD and the step's tag");
  assert.match(git("log", "-1", "--format=%s"), /^Step 1: /);
  assert.match(git("branch", "--show-current"), /\/02-supabase$/, "work moved to the personal branch");
  if (rejectedBefore !== null) {
    assert.equal(git("show", `HEAD:${rejected}`), rejectedBefore, "the rejected change kept the attendee's file");
  }
  log(`rejected change 0 of ${rejected}`);
  for (const file of files.filter((f) => f.path !== rejected)) {
    assert.equal(
      git("show", `HEAD:${file.path}`),
      git("show", `02-supabase/01-read:${file.path}`),
      `${file.path} matches the step`,
    );
  }
  assert.equal(git("status", "--porcelain", "--untracked-files=no"), "", "nothing tracked is left dirty");
  assert.equal(opened.length, 1, "the docs tab handoff opened one URL");
  assert.match(
    opened[0]!,
    /^https:\/\/devdogsuga\.org\/docs\/workshops\/.+#done=02-supabase%2F01-read&session=smoke-session$/,
  );
  log(`handoff URL: ${opened[0]}`);
  log("merge commit recorded: parents, subject, branch and tree all check out");

  // The panel now sees step 1.
  await api.steps.refresh();
  assert.equal(api.steps.open?.snapshot.current?.tag, "02-supabase/01-read");
  log("panel moved to step 1");
}
