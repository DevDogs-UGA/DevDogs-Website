import * as vscode from "vscode";
import { workshopOfBranch, latestWorkshop } from "../core/index.js";
import { Branches } from "./branches.js";
import { Flow, REF_SCHEME, refContentProvider } from "./flow.js";
import { errorText, logError, output } from "./log.js";
import { LiveWorkshops } from "./live.js";
import { isPendingFresh } from "./pending.js";
import { CMD, StepsProvider, tagOf } from "./panel.js";
import { CMD as REVIEW_CMD, WorkshopReviewController, commandIndexOf, fileIndexOf } from "./review-controller.js";
import { State } from "./state.js";
import { stepLabel } from "./steps-model.js";

/**
 * Entry point: wires the URI handler, the Workshop sidebar and its commands.
 * Everything with a decision in it lives in the pure modules beside this
 * file; this only connects them to VS Code.
 *
 * `live` (TASK-379) listens for the presenter's checkpoints while a workshop
 * repo is open, behind the `devdogsWorkshops.followLive` setting.
 */
export async function activate(context: vscode.ExtensionContext): Promise<WorkshopsApi> {
  const state = new State(context.globalState);
  const branches = new Branches(state);
  const steps = new StepsProvider();
  const refresh = () => void steps.refresh();
  const review = new WorkshopReviewController(refresh);
  const flow = new Flow(state, branches, review, refresh);

  const stepsView = vscode.window.createTreeView("devdogsWorkshops.steps", { treeDataProvider: steps });
  const live = new LiveWorkshops(steps, flow, review, stepsView);

  const api: WorkshopsApi = { handleLink: (path, query) => flow.handleLink(path, query),
    live,
    review,
    setUsername: (name) => Promise.resolve(state.setUsername(name)),
    steps,
  };
  context.subscriptions.push(
    output,
    review,
    live,
    stepsView,
    vscode.window.createTreeView("devdogsWorkshops.live", { treeDataProvider: live.treeDataProvider }),
    vscode.window.createTreeView("devdogsWorkshops.review", { treeDataProvider: review.treeDataProvider }),
    vscode.workspace.registerTextDocumentContentProvider(REF_SCHEME, refContentProvider),
    vscode.window.registerUriHandler({
      handleUri: (uri) => flow.handleLink(uri.path, uri.query).catch((e) => {
        logError("handleUri", e);
        void vscode.window.showErrorMessage(`DevDogs Workshops: ${errorText(e)}`);
      }),
    }),
    vscode.window.onDidChangeWindowState((s) => s.focused && refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
  );

  // Branch switches and new tags (from a fetch or the terminal) change the panel.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, ".git/{HEAD,packed-refs,refs/tags/**}"),
    );
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    context.subscriptions.push(watcher);
  }

  const pickStep = async (title: string): Promise<string | undefined> => {
    const open = steps.open ?? (await steps.refresh().then(() => steps.open));
    if (!open || open.snapshot.line.length === 0) {
      void vscode.window.showInformationMessage("Open a DevDogs workshop repository first.");
      return undefined;
    }
    const current = open.snapshot.current?.tag;
    const picked = await vscode.window.showQuickPick(
      open.snapshot.line
        .filter((s) => s.number > 0)
        .map((step) => ({
          label: stepLabel(step),
          description: step.tag === current ? "you are here" : step.workshop,
          detail: step.run.length ? step.run.map((c) => `▶ ${c}`).join("  ") : undefined,
          tag: step.tag,
        })),
      { title, placeHolder: "Pick a step" },
    );
    return picked?.tag;
  };

  const register = (command: string, handler: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(command, handler));

  register(CMD.refresh, () => steps.refresh());

  const reviewTo = async (tag: string) => {
    const open = steps.open;
    if (!open) return;
    await flow.reviewTo(open.root, open.repo, tag);
    refresh();
  };
  register(CMD.reviewToStep, async (arg) => {
    const tag = tagOf(arg);
    if (tag) await reviewTo(tag);
  });
  register(CMD.goToStep, async () => {
    const tag = await pickStep("Workshop: Go to step");
    if (tag) await reviewTo(tag);
  });

  register(CMD.moveMyWork, async () => {
    const open = steps.open;
    if (!open) return;
    const { workshops, branch } = open.snapshot;
    const workshop = workshopOfBranch(branch, workshops) ?? open.snapshot.current?.workshop ?? latestWorkshop(workshops);
    if (workshop) await branches.ensurePersonalBranch(open.root, workshop);
    refresh();
  });

  register(CMD.jumpToStep, async (arg) => {
    const open = steps.open;
    if (!open) return;
    const tag = tagOf(arg) ?? (await pickStep("Workshop: Jump to step (discards my changes)"));
    if (!tag) return;
    const step = open.snapshot.line.find((s) => s.tag === tag);
    await branches.jumpToStep(open.root, tag, step ? stepLabel(step) : tag);
    refresh();
  });

  // Review commands (TASK-376) and step commands (TASK-377).
  register(REVIEW_CMD.acceptChange, (thread) => review.decideThread(thread as vscode.CommentThread, "accept"));
  register(REVIEW_CMD.rejectChange, (thread) => review.decideThread(thread as vscode.CommentThread, "reject"));
  register(REVIEW_CMD.acceptAtCursor, () => review.decideAtCursor("accept"));
  register(REVIEW_CMD.rejectAtCursor, () => review.decideAtCursor("reject"));
  register(REVIEW_CMD.acceptFile, (arg) => review.decideFile("accept", fileIndexOf(arg)));
  register(REVIEW_CMD.rejectFile, (arg) => review.decideFile("reject", fileIndexOf(arg)));
  register(REVIEW_CMD.nextFile, () => review.nextFile());
  register(REVIEW_CMD.acceptAll, () => review.decideAll("accept"));
  register(REVIEW_CMD.rejectAll, () => review.decideAll("reject"));
  register(REVIEW_CMD.finish, () => review.finish());
  register(REVIEW_CMD.cancel, () => review.cancel());
  register(REVIEW_CMD.openFile, (arg) => {
    const index = fileIndexOf(arg);
    return index === undefined ? undefined : review.openFile(index);
  });
  register(REVIEW_CMD.runCommand, (arg) => {
    const index = commandIndexOf(arg);
    return index === undefined ? undefined : review.runCommand(index);
  });
  register(REVIEW_CMD.runAll, () => review.runAll());
  register(REVIEW_CMD.confirmCommand, (arg) => {
    const index = commandIndexOf(arg);
    return index === undefined ? undefined : review.confirmCommand(index);
  });
  register(REVIEW_CMD.skipCommands, () => review.skipCommands());

  await steps.refresh();
  live.sync();

  // A link parked before a folder-open reload resumes now (expired ones are dropped).
  const pending = state.pending;
  if (pending) {
    await state.setPending(undefined);
    if (isPendingFresh(pending, Date.now())) {
      output.appendLine("Resuming a workshop link after opening the folder.");
      void flow.resume(pending.path, pending.query);
    }
  }
  return api;
}

export function deactivate(): void {}

/**
 * What `activate` returns. Not a public contract: the integration tests use it
 * to drive the same paths a link or a click does and to read state back.
 */
export interface WorkshopsApi {
  live: LiveWorkshops;
  /** Handles a `vscode://devdogsuga.workshops/...` link's path and (decoded) query. */
  handleLink(path: string, query: string): Promise<void>;
  review: WorkshopReviewController;
  /** Stores the GitHub username as if the attendee had typed it (skips the prompt). */
  setUsername(name: string): Promise<void>;
  steps: StepsProvider;
}
