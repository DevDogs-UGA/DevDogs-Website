import * as vscode from "vscode";
import { workshopOfBranch, latestWorkshop } from "../core/index.js";
import { Branches } from "./branches.js";
import { Flow, REF_SCHEME, refContentProvider } from "./flow.js";
import { errorText, logError, output } from "./log.js";
import { isPendingFresh } from "./pending.js";
import { CMD, StepsProvider, tagOf } from "./panel.js";
import { StubReviewController } from "./review.js";
import { State } from "./state.js";
import { stepLabel } from "./steps-model.js";

/**
 * Entry point: wires the URI handler, the Workshop sidebar and its commands.
 * Everything with a decision in it lives in the pure modules beside this
 * file; this only connects them to VS Code.
 *
 * Seams for later tasks: `review` (TASK-376 diff review), the "Live" view
 * declared in package.json but hidden (TASK-379).
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const state = new State(context.globalState);
  const branches = new Branches(state);
  const review = new StubReviewController();
  const steps = new StepsProvider();
  const refresh = () => void steps.refresh();
  const flow = new Flow(state, branches, review, refresh);

  const stepsView = vscode.window.createTreeView("devdogsWorkshops.steps", { treeDataProvider: steps });
  context.subscriptions.push(
    output,
    stepsView,
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

  await steps.refresh();

  // A link parked before a folder-open reload resumes now (expired ones are dropped).
  const pending = state.pending;
  if (pending) {
    await state.setPending(undefined);
    if (isPendingFresh(pending, Date.now())) {
      output.appendLine("Resuming a workshop link after opening the folder.");
      void flow.resume(pending.path, pending.query);
    }
  }
}

export function deactivate(): void {}
