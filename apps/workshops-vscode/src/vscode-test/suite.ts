import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import * as vscode from "vscode";
import type { WorkshopsApi } from "../extension/extension";
import { rawDataToString } from "../extension/live-client";

/**
 * Runs inside a real VS Code (see run.ts). One scenario, top to bottom, the
 * way an attendee does it from a docs link: the panel lists the steps, a
 * `/review` link opens a review to step 1, the step's command runs in the
 * Workshop terminal, files open in diff editors, most changes are accepted and
 * one rejected, and Finish records a merge commit. Around it, a fake relay
 * (a local ws server) plays the presenter: the extension follows it, offers
 * the steps it finishes, holds one back during the review, and reports the
 * attendee's step.
 */

const clone = process.env["SMOKE_CLONE"]!;
const git = (...args: string[]) =>
  execFileSync("git", ["-C", clone, ...args], { encoding: "utf8" }).trim();

async function until<T>(
  what: string,
  check: () => T | undefined | false,
  timeoutMs = 60_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeoutMs)
      throw new Error(`Timed out waiting for ${what}`);
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

/** A stand-in for the slides relay's /attend endpoint. */
async function fakeRelay() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => wss.once("listening", resolve));
  const urls: string[] = [];
  const received: unknown[] = [];
  const sockets: WebSocket[] = [];
  wss.on("connection", (ws, req) => {
    urls.push(req.url ?? "");
    sockets.push(ws);
    ws.on("message", (data) =>
      received.push(JSON.parse(rawDataToString(data))),
    );
  });
  const { port } = wss.address() as { port: number };
  const send = (message: object) =>
    sockets.at(-1)!.send(JSON.stringify(message));
  return { wss, port, urls, received, send };
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<WorkshopsApi>(
    "devdogsuga.workshops",
  );
  assert.ok(
    extension,
    "extension devdogsuga.workshops is installed in the host",
  );
  const api = await extension.activate();
  assert.equal(extension.isActive, true);
  log("activated");

  // The panel's step list.
  await api.steps.refresh();
  const open = api.steps.open;
  assert.ok(open, "the panel found the workspace clone");
  assert.equal(open.repo, "DevDogsUGA/Web-Workshops");
  const numbered = open.snapshot.line
    .filter((s) => s.number > 0)
    .map((s) => s.tag);
  assert.deepEqual(numbered.slice(0, 2), [
    "02-supabase/01-read",
    "02-supabase/02-sign-in",
  ]);
  assert.equal(open.snapshot.current?.tag, "02-supabase/00-start");
  log(`panel lists ${numbered.length} steps, current is 00-start`);

  // Live workshops: follow a fake relay.
  const relay = await fakeRelay();
  const prompts: string[] = [];
  let answer: string | undefined = "Later";
  api.live.prompt = async (message) => {
    prompts.push(message);
    return answer;
  };
  const config = vscode.workspace.getConfiguration("devdogsWorkshops");
  await config.update(
    "liveRelayUrl",
    `ws://127.0.0.1:${relay.port}/attend`,
    vscode.ConfigurationTarget.Global,
  );
  await config.update("followLive", true, vscode.ConfigurationTarget.Global);
  await until("the relay connection", () => relay.urls.length === 1);
  assert.equal(
    relay.urls[0],
    "/attend?track=web",
    "the track comes from the repo",
  );
  await until("the first step report", () => relay.received.length === 1);
  assert.deepEqual(
    relay.received[0],
    { t: "step", step: 0 },
    "only a step number is sent",
  );
  assert.equal(api.live.presenterLive, false, "no presenter yet");
  relay.send({ t: "live", live: true });
  await until("the Live view", () => api.live.presenterLive || undefined);
  const [, step2, step3] = numbered as [string, string, string];
  const tracks = ["web"];
  relay.send({ t: "checkpoint", id: "1", ref: step2, tracks: ["mobile"] });
  relay.send({ t: "checkpoint", id: "2", ref: "02-supabase/00-start", tracks });
  relay.send({ t: "checkpoint", id: "3", ref: step2, tracks });
  await until("the offer", () => prompts.length > 0 || undefined);
  assert.equal(
    prompts.length,
    1,
    "other tracks' and already-had checkpoints don't prompt",
  );
  assert.match(prompts[0]!, /^Presenter finished Step 2: /);
  await until("the badge", () => api.live.badge ?? undefined);
  assert.equal(api.live.badge!.value, 1);
  assert.equal(api.live.pending.badge, step2);
  log(`live: offered "${prompts[0]}", Later left a badge`);

  // Refused links do nothing.
  await api.handleLink(
    "/review",
    "repo=evil/Web-Workshops&to=02-supabase/01-read",
  );
  assert.equal(api.review.snapshot, undefined);

  await api.setUsername("smoke-tester");
  const opened: string[] = [];
  api.review.openUrl = async (url) => void opened.push(url);
  const before = git("rev-parse", "HEAD");

  // The link path: /review?repo&to&session.
  await api.handleLink(
    "/review",
    "repo=devdogsuga/web-workshops&to=02-supabase/01-read&session=smoke-session",
  );
  const started = await until("review to open", () => api.review.snapshot);
  assert.equal(started.target, "02-supabase/01-read");
  assert.equal(started.phase, "commands");
  assert.deepEqual(
    started.commands.map((c) => c.command),
    ["echo ran > ran.txt"],
  );
  log("review opened with its command");

  // Step command in the Workshop terminal.
  // The presenter finishes step 3 while the review is open: held back.
  relay.send({ t: "checkpoint", id: "4", ref: step3, tracks });
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(prompts.length, 1, "a review in progress is never interrupted");
  await vscode.commands.executeCommand(
    "devdogsWorkshops.review.runAllCommands",
  );
  let state = api.review.snapshot!.commands[0]!.state;
  if (state === "sent") {
    log("no shell integration here: line was sent, confirming by hand");
    await vscode.commands.executeCommand(
      "devdogsWorkshops.review.confirmCommand",
      0,
    );
  } else {
    log(`command finished via shell integration: ${state}`);
  }
  await until(
    "command result",
    () => api.review.snapshot!.phase === "files" || undefined,
  );
  if (state === "done")
    await until(
      "ran.txt",
      () => existsSync(join(clone, "ran.txt")) || undefined,
      15_000,
    );
  state = api.review.snapshot!.commands[0]!.state;
  assert.equal(state, "done");

  // Files and diff editors.
  const files = api.review.snapshot!.files;
  assert.ok(files.length > 0, "the step has files to review");
  assert.ok(files.every((f) => f.status === "pending"));
  await until("a review diff tab", () =>
    vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find(
        (t) =>
          t.input instanceof vscode.TabInputTextDiff &&
          t.input.modified.scheme === "devdogs-review",
      ),
  );
  log(
    `${files.length} files to review, diff editor open: ${files.map((f) => `${f.path}(${f.changes})`).join(", ")}`,
  );

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
  const rejectIndex = files.findIndex(
    (f) => existedBefore(f.path) && f.changes === 1,
  );
  const target = rejectIndex >= 0 ? rejectIndex : files.length - 1;
  const rejected = files[target]!.path;
  await vscode.commands.executeCommand("devdogsWorkshops.review.acceptAll");
  api.review.decideChange(target, 0, "reject");
  assert.equal(
    api.review.snapshot!.files[target]!.status,
    files[target]!.changes === 1 ? "rejected" : "partial",
  );
  const rejectedBefore = existedBefore(rejected)
    ? git("show", `${before}:${rejected}`)
    : null;

  await shot("2-after-decisions");
  await vscode.commands.executeCommand("devdogsWorkshops.review.finish");
  await until(
    "review to finish",
    () => api.review.snapshot === undefined || undefined,
  );

  // The merge commit.
  const tagCommit = git("rev-parse", "02-supabase/01-read^{commit}");
  const parents = git("rev-list", "--parents", "-n1", "HEAD")
    .split(" ")
    .slice(1);
  assert.deepEqual(
    parents,
    [before, tagCommit],
    "HEAD is a merge of the old HEAD and the step's tag",
  );
  assert.match(git("log", "-1", "--format=%s"), /^Step 1: /);
  assert.match(
    git("branch", "--show-current"),
    /\/02-supabase$/,
    "work moved to the personal branch",
  );
  if (rejectedBefore !== null) {
    assert.equal(
      git("show", `HEAD:${rejected}`),
      rejectedBefore,
      "the rejected change kept the attendee's file",
    );
  }
  log(`rejected change 0 of ${rejected}`);
  for (const file of files.filter((f) => f.path !== rejected)) {
    assert.equal(
      git("show", `HEAD:${file.path}`),
      git("show", `02-supabase/01-read:${file.path}`),
      `${file.path} matches the step`,
    );
  }
  assert.equal(
    git("status", "--porcelain", "--untracked-files=no"),
    "",
    "nothing tracked is left dirty",
  );
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

  // After Finish: the step is reported, and the held-back step is offered.
  await until("the step report", () =>
    relay.received.some((m) => (m as { step?: number }).step === 1),
  );
  assert.deepEqual(
    relay.received.map((m) => (m as { step: number }).step),
    [0, 1],
  );
  await until(
    "the offer after the review",
    () => prompts.length === 2 || undefined,
  );
  assert.match(prompts[1]!, /^Presenter finished Step 3: /);
  assert.equal(
    api.live.pending.badge,
    step3,
    "Later moved the badge to the newer step",
  );
  log("live: reported step 1, then offered step 3 once the review finished");

  // "Review" on an offer starts a review to that step (the next one, so no
  // "review steps together?" dialog, which the test host refuses).
  answer = "Review";
  relay.send({ t: "checkpoint", id: "5", ref: step2, tracks });
  const offered = await until(
    "the review from the offer",
    () => api.review.snapshot,
  );
  assert.equal(offered.target, step2);
  assert.equal(api.live.pending.badge, step3, "the newer step stays badged");
  await api.review.cancel();

  // The presenter leaves.
  relay.send({ t: "live", live: false });
  await until("presenter gone", () => !api.live.presenterLive || undefined);
  await config.update("followLive", false, vscode.ConfigurationTarget.Global);
  relay.wss.close();
  log("live: presenter left, following turned off");
}
