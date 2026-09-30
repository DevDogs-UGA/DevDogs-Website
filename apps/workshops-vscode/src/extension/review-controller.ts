import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  finishReview,
  git,
  loadFileMerge,
  MissingIdentityError,
  resolveOutcome,
  type Decision,
  type FileMerge,
  type ReviewFile,
  type ReviewPlan,
  type TargetFile,
} from "../core/index.js";
import { CommandQueue, type CommandState } from "./command-queue.js";
import { errorText, logError } from "./log.js";
import { handoffUrl, nextStep } from "./handoff.js";
import {
  REVIEW_ACTIVE,
  type ReviewController,
  type ReviewStartOptions,
} from "./review.js";
import {
  changeAtLine,
  leftText,
  ReviewModel,
  type FileStatus,
} from "./review-model.js";
import {
  parseReviewUri,
  reviewUri,
  REVIEW_SCHEME,
  ReviewFs,
} from "./review-fs.js";
import { rangeLabel, reviewTitle } from "./scope.js";
import { captureError } from "./telemetry.js";
import { WorkshopTerminal } from "./workshop-terminal.js";

/**
 * The review UI (TASK-376) and the step commands that come before it
 * (TASK-377). A review opens with the range's `Run:` commands; once they are
 * done the file merges are worked out (so edits a command already made drop
 * out), each file opens in `vscode.diff` with their code on the left and the
 * proposal on the right, and every change gets an Accept/Reject bar. Nothing
 * is written until Finish.
 */

export const CMD = {
  acceptChange: "devdogsWorkshops.review.acceptChange",
  rejectChange: "devdogsWorkshops.review.rejectChange",
  acceptAtCursor: "devdogsWorkshops.review.acceptAtCursor",
  rejectAtCursor: "devdogsWorkshops.review.rejectAtCursor",
  acceptFile: "devdogsWorkshops.review.acceptFile",
  rejectFile: "devdogsWorkshops.review.rejectFile",
  nextFile: "devdogsWorkshops.review.nextFile",
  acceptAll: "devdogsWorkshops.review.acceptAll",
  rejectAll: "devdogsWorkshops.review.rejectAll",
  finish: "devdogsWorkshops.review.finish",
  cancel: "devdogsWorkshops.review.cancel",
  openFile: "devdogsWorkshops.review.openFile",
  runCommand: "devdogsWorkshops.review.runCommand",
  runAll: "devdogsWorkshops.review.runAllCommands",
  confirmCommand: "devdogsWorkshops.review.confirmCommand",
  skipCommands: "devdogsWorkshops.review.skipCommands",
} as const;

const IN_REVIEW_FILE = "devdogsWorkshops.inReviewFile";

interface Session {
  plan: ReviewPlan;
  options: ReviewStartOptions;
  queue: CommandQueue;
  /** Undefined until the commands are done and the merges are worked out. */
  model: ReviewModel | undefined;
  /** Files that turned out binary once read: taken from the target like the rest. */
  lateFromTarget: TargetFile[];
}

type Node =
  | { kind: "title"; text: string }
  | { kind: "command"; index: number }
  | { kind: "runAll" }
  | { kind: "skip" }
  | { kind: "note"; text: string }
  | { kind: "file"; index: number }
  | { kind: "action"; id: "acceptAll" | "rejectAll" | "finish" };

/** State the integration tests (and later features) can read without poking the UI. */
export interface ReviewSnapshot {
  phase: "commands" | "files";
  target: string;
  commands: { command: string; state: CommandState }[];
  files: { path: string; status: FileStatus; changes: number }[];
}

const STATUS_ICON: Record<FileStatus, [string, string | undefined]> = {
  pending: ["circle-outline", undefined],
  accepted: ["check", "charts.green"],
  rejected: ["close", "charts.red"],
  partial: ["circle-half-filled", "charts.yellow"],
};

const BAR_COLOR = {
  pending: "#3794ff",
  accepted: "#2ea043",
  rejected: "#f85149",
} as const;

function barType(color: string): vscode.TextEditorDecorationType {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><rect x='1' width='4' height='16' fill='${color}'/></svg>`;
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    gutterIconPath: vscode.Uri.parse(
      `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    ),
    gutterIconSize: "contain",
    overviewRulerColor: color,
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
}

export class WorkshopReviewController
  implements ReviewController, vscode.Disposable
{
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  private readonly fs = new ReviewFs();
  private readonly comments = vscode.comments.createCommentController(
    "devdogsWorkshops.review",
    "Workshop review",
  );
  private readonly terminal = new WorkshopTerminal();
  private readonly bars = {
    pending: barType(BAR_COLOR.pending),
    accepted: barType(BAR_COLOR.accepted),
    rejected: barType(BAR_COLOR.rejected),
  };
  private readonly threads = new Map<
    vscode.CommentThread,
    { file: number; id: number }
  >();
  private readonly threadOf = new Map<string, vscode.CommentThread>();
  private readonly disposables: vscode.Disposable[] = [];
  private session: Session | undefined;
  /** Opens the docs page after Finish. A field so tests can swap out the browser. */
  openUrl: (url: string) => Thenable<unknown> = (url) =>
    vscode.env.openExternal(vscode.Uri.parse(url, true));

  /**
   * Called when a review ends for good: finished (true) or cancelled (false).
   * Not when a new review replaces one. Live workshops use it to offer a step
   * the presenter finished meanwhile.
   */
  onEnded: ((finished: boolean) => void) | undefined;

  constructor(private readonly onFinished: () => void) {
    this.comments.options = { placeHolder: "", prompt: "" };
    this.disposables.push(
      vscode.workspace.registerFileSystemProvider(REVIEW_SCHEME, this.fs, {
        isReadonly: true,
        isCaseSensitive: true,
      }),
      vscode.window.onDidChangeVisibleTextEditors(() => this.applyBars()),
      vscode.window.tabGroups.onDidChangeTabs(() => void this.updateContext()),
      this.comments,
      this.terminal,
      ...Object.values(this.bars),
      this.changed,
    );
  }

  readonly treeDataProvider: vscode.TreeDataProvider<unknown> = {
    onDidChangeTreeData: this.changed.event as vscode.Event<unknown>,
    getChildren: () => this.nodes(),
    getTreeItem: (node) => this.item(node as Node),
  };

  /** Read-only view of the review, for tests. */
  get snapshot(): ReviewSnapshot | undefined {
    const s = this.session;
    if (!s) return undefined;
    return {
      phase: s.model ? "files" : "commands",
      target: s.plan.target.tag,
      commands: s.queue.items.map(({ command, state }) => ({ command, state })),
      files: (s.model?.files ?? []).map((f, i) => ({
        path: f.file.path,
        status: s.model!.status(i),
        changes: f.merge.changes.length,
      })),
    };
  }

  // -- starting -----------------------------------------------------------

  async start(plan: ReviewPlan, options: ReviewStartOptions): Promise<void> {
    if (this.session && this.hasProgress(this.session)) {
      const replace = await vscode.window.showWarningMessage(
        "Replace the review in progress?",
        {
          modal: true,
          detail: "Your accept and reject choices in it are not kept.",
        },
        "Replace it",
      );
      if (replace !== "Replace it") return;
    }
    await this.end();
    this.session = {
      plan,
      options,
      queue: new CommandQueue(plan.commands),
      model: undefined,
      lateFromTarget: [],
    };
    await vscode.commands.executeCommand("setContext", REVIEW_ACTIVE, true);
    this.changed.fire(undefined);
    await vscode.commands.executeCommand("devdogsWorkshops.review.focus");
    // No commands: straight to the files. Otherwise the commands come first.
    if (this.session.queue.allDone) await this.enterFiles();
  }

  private hasProgress(s: Session): boolean {
    return (
      s.queue.items.some((i) => i.state !== "pending") ||
      (s.model?.files.some((f) => f.decisions.size > 0) ?? false)
    );
  }

  /** Works out the merges from the working tree as it is now. */
  private async enterFiles(): Promise<void> {
    const s = this.session;
    if (!s || s.model) return;
    const { root } = s.options;
    const kept: { file: ReviewFile; merge: FileMerge }[] = [];
    try {
      for (const file of s.plan.files) {
        const merge = await loadFileMerge(root, s.plan, file);
        if (merge === null) {
          s.lateFromTarget.push({ ...file, reason: "binary" });
          continue;
        }
        // A pure rename has no changes to review but still has to be applied.
        const pureRename =
          file.status === "renamed" && !existsSync(join(root, file.path));
        if (merge.changes.length > 0 || pureRename) kept.push({ file, merge });
      }
    } catch (error) {
      logError("enterFiles", error);
      void vscode.window.showErrorMessage(
        `Couldn't read the files for this review: ${errorText(error)}`,
      );
      return;
    }
    s.model = new ReviewModel(kept);
    this.buildThreads();
    this.changed.fire(undefined);
    const first = s.model.files.findIndex((f) => f.merge.changes.length > 0);
    if (first >= 0) await this.openFile(first);
    else {
      void vscode.window.showInformationMessage(
        "You already have every change in this step. Finish to record it.",
      );
    }
  }

  // -- diffs, threads, bars -----------------------------------------------

  private buildThreads(): void {
    const s = this.session!;
    this.fs.clear();
    s.model!.files.forEach((state, i) => {
      this.fs.set(reviewUri("left", state.file.path), leftText(state.merge));
      this.fs.set(reviewUri("right", state.file.path), s.model!.layout(i).text);
      for (const change of state.merge.changes) {
        const thread = this.comments.createCommentThread(
          reviewUri("right", state.file.path),
          new vscode.Range(0, 0, 0, 0),
          [
            {
              body: new vscode.MarkdownString(""),
              mode: vscode.CommentMode.Preview,
              author: { name: "Workshop step" },
            },
          ],
        );
        thread.canReply = false;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        this.threads.set(thread, { file: i, id: change.id });
        this.threadOf.set(`${i}:${change.id}`, thread);
      }
      this.refreshFile(i);
    });
  }

  /** Pushes a file's current decisions to its right side, its threads and its bars. */
  private refreshFile(i: number): void {
    const model = this.session!.model!;
    const layout = model.layout(i);
    const path = model.files[i]!.file.path;
    this.fs.set(reviewUri("right", path), layout.text);
    const lastLine = Math.max(layout.text.split("\n").length - 1, 0);
    for (const region of layout.regions) {
      const thread = this.threadOf.get(`${i}:${region.id}`);
      if (!thread) continue;
      const line = Math.min(region.start, lastLine);
      thread.range = new vscode.Range(line, 0, line, 0);
      thread.contextValue = region.decision ?? "pending";
      thread.state =
        region.decision === undefined
          ? vscode.CommentThreadState.Unresolved
          : vscode.CommentThreadState.Resolved;
      thread.label =
        region.decision === "accept"
          ? "Accepted"
          : region.decision === "reject"
            ? "Rejected (your code kept)"
            : "Step's change: accept or reject";
    }
    this.applyBars();
    this.changed.fire(undefined);
  }

  private applyBars(): void {
    const model = this.session?.model;
    for (const editor of vscode.window.visibleTextEditors) {
      const parsed = parseReviewUri(editor.document.uri);
      if (!parsed || parsed.side !== "right") continue;
      const index =
        model?.files.findIndex((f) => f.file.path === parsed.path) ?? -1;
      const ranges: Record<keyof typeof this.bars, vscode.Range[]> = {
        pending: [],
        accepted: [],
        rejected: [],
      };
      if (model && index >= 0) {
        for (const region of model.layout(index).regions) {
          const key =
            region.decision === "accept"
              ? "accepted"
              : region.decision === "reject"
                ? "rejected"
                : "pending";
          const end = region.start + Math.max(region.count, 1) - 1;
          ranges[key].push(
            new vscode.Range(
              region.start,
              0,
              Math.min(end, editor.document.lineCount - 1),
              0,
            ),
          );
        }
      }
      for (const key of Object.keys(this.bars) as (keyof typeof this.bars)[]) {
        editor.setDecorations(this.bars[key], ranges[key]);
      }
    }
  }

  async openFile(index: number): Promise<void> {
    const s = this.session;
    const state = s?.model?.files[index];
    if (!s || !state) return;
    if (state.merge.changes.length === 0) {
      void vscode.window.showInformationMessage(
        `This step renames ${state.file.oldPath ?? "the file"} to ${state.file.path}. It is applied when you Finish.`,
      );
      return;
    }
    const title = `${state.file.path} (yours ↔ ${s.plan.target.title || s.plan.target.slug})`;
    await vscode.commands.executeCommand(
      "vscode.diff",
      reviewUri("left", state.file.path),
      reviewUri("right", state.file.path),
      title,
      { preview: false },
    );
    this.applyBars();
  }

  // -- decisions ----------------------------------------------------------

  private decide(file: number, id: number, decision: Decision): void {
    this.session?.model?.decide(file, id, decision);
    this.refreshFile(file);
  }

  /** One change of one file; what a thread's Accept/Reject buttons call. */
  decideChange(file: number, id: number, decision: Decision): void {
    this.decide(file, id, decision);
  }

  decideThread(
    thread: vscode.CommentThread | undefined,
    decision: Decision,
  ): void {
    const ref = thread && this.threads.get(thread);
    if (ref) this.decide(ref.file, ref.id, decision);
  }

  /** The review file index of whichever review diff is active. */
  private activeFileIndex(): number | undefined {
    const model = this.session?.model;
    if (!model) return undefined;
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri =
      input instanceof vscode.TabInputTextDiff
        ? input.modified
        : vscode.window.activeTextEditor?.document.uri;
    const parsed = uri && parseReviewUri(uri);
    if (!parsed) return undefined;
    const index = model.files.findIndex((f) => f.file.path === parsed.path);
    return index >= 0 ? index : undefined;
  }

  decideAtCursor(decision: Decision): void {
    const index = this.activeFileIndex();
    const model = this.session?.model;
    if (index === undefined || !model) return;
    const editor =
      vscode.window.visibleTextEditors.find((e) => {
        const p = parseReviewUri(e.document.uri);
        return p?.side === "right" && p.path === model.files[index]!.file.path;
      }) ?? vscode.window.activeTextEditor;
    const id = changeAtLine(
      model.layout(index),
      editor?.selection.active.line ?? 0,
    );
    if (id !== undefined) this.decide(index, id, decision);
  }

  decideFile(decision: Decision, index = this.activeFileIndex()): void {
    if (index === undefined || !this.session?.model) return;
    this.session.model.decideFile(index, decision);
    this.refreshFile(index);
  }

  decideAll(decision: Decision): void {
    const model = this.session?.model;
    if (!model) return;
    model.decideAll(decision);
    model.files.forEach((_, i) => this.refreshFile(i));
  }

  async nextFile(): Promise<void> {
    const model = this.session?.model;
    if (!model) return;
    const next = model.nextFile(this.activeFileIndex() ?? -1);
    if (next !== undefined) await this.openFile(next);
  }

  // -- commands (TASK-377) ------------------------------------------------

  /** Runs one command in the Workshop terminal. Returns whether it is done. */
  async runCommand(index: number): Promise<boolean> {
    const s = this.session;
    if (!s?.queue.canRun(index)) return false;
    // A retry starts from pending.
    s.queue.start(index);
    this.changed.fire(undefined);
    const command = s.queue.items[index]!.command;
    const result = await this.terminal.run(command, s.options.root);
    if (this.session !== s) return false;
    if (result.kind === "sent") s.queue.sent(index);
    else s.queue.finish(index, result.code);
    this.changed.fire(undefined);

    const item = s.queue.items[index]!;
    if (item.state === "failed") {
      void vscode.window.showErrorMessage(
        `"${command}" failed (exit code ${item.exitCode}). Fix the problem, then run it again from the Review panel.`,
      );
    }
    await this.afterCommand(s);
    return item.state === "done";
  }

  async runAll(): Promise<void> {
    const s = this.session;
    if (!s) return;
    for (
      let i = s.queue.nextIndex;
      i >= 0 && s.queue.canRun(i);
      i = s.queue.nextIndex
    ) {
      if (!(await this.runCommand(i))) return;
    }
  }

  async confirmCommand(index: number): Promise<void> {
    const s = this.session;
    if (!s) return;
    s.queue.confirm(index);
    this.changed.fire(undefined);
    await this.afterCommand(s);
  }

  /** Skipping treats every command as done: the attendee has run them another way. */
  async skipCommands(): Promise<void> {
    const s = this.session;
    if (!s) return;
    s.queue.items.forEach((_, i) => s.queue.confirm(i));
    this.changed.fire(undefined);
    await this.afterCommand(s);
  }

  private async afterCommand(s: Session): Promise<void> {
    if (this.session === s && s.queue.allDone && !s.model)
      await this.enterFiles();
  }

  // -- finishing ----------------------------------------------------------

  async finish(): Promise<void> {
    const s = this.session;
    if (!s) return;
    if (!s.model) {
      void vscode.window.showInformationMessage(
        "Run the step's commands (or skip them) before finishing.",
      );
      return;
    }
    const model = s.model;
    if (model.undecided > 0) {
      const answer = await vscode.window.showWarningMessage(
        `${model.undecided} change${model.undecided === 1 ? " is" : "s are"} still undecided.`,
        {
          modal: true,
          detail:
            "Reject keeps your code for those; Accept takes the step's version.",
        },
        "Accept the rest",
        "Reject the rest",
      );
      if (!answer) return;
      const rest: Decision = answer === "Accept the rest" ? "accept" : "reject";
      model.files.forEach((state, i) => {
        for (const change of state.merge.changes)
          if (!state.decisions.has(change.id)) model.decide(i, change.id, rest);
      });
    }

    const { root } = s.options;
    const outcomes = model.files.map((state, i) =>
      resolveOutcome(
        state.file,
        state.merge,
        model.decider(i),
        existsSync(join(root, state.file.path)),
      ),
    );
    const autoCommit = vscode.workspace
      .getConfiguration("devdogsWorkshops")
      .get<boolean>("autoCommit", true);
    const title = reviewTitle(s.plan.steps);
    try {
      const result = await finishReview({
        root,
        targetTag: s.plan.target.tag,
        message: title,
        outcomes,
        fromTarget: [...s.plan.fromTarget, ...s.lateFromTarget],
        autoCommit,
        beforeWrite: async () =>
          (await s.options.ensurePersonalBranch()) !== undefined,
      });
      if (result === null) return; // they declined the branch move; nothing was written
      const done = s.plan.steps.map((step) => step.tag);
      const next = nextStep(s.options.line, s.plan.target);
      const session = s.options.session;
      await this.end();
      this.onFinished();
      this.onEnded?.(true);
      void vscode.window.showInformationMessage(
        autoCommit
          ? `${rangeLabel(s.plan.steps)} recorded as a merge commit.`
          : `${rangeLabel(s.plan.steps)} is staged. Commit it to record the merge.`,
      );
      const url = handoffUrl({ nextDocs: next?.docs, doneTags: done, session });
      if (url) {
        try {
          await this.openUrl(url);
        } catch (error) {
          logError("handoff", error); // the merge is done; a browser that won't open is not a failure
        }
      }
    } catch (error) {
      if (error instanceof MissingIdentityError) {
        if (await askCommitIdentity(root)) await this.finish();
        return;
      }
      captureError("finish", error);
      logError("finish", error);
      void vscode.window.showErrorMessage(
        `Couldn't finish the review: ${errorText(error)}`,
      );
    }
  }

  /** Closes the review's diffs and forgets it. Nothing on disk changes. */
  async end(): Promise<void> {
    const had = this.session !== undefined;
    this.session = undefined;
    for (const thread of this.threads.keys()) thread.dispose();
    this.threads.clear();
    this.threadOf.clear();
    const tabs = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .filter(
        (t) =>
          (t.input instanceof vscode.TabInputTextDiff &&
            t.input.modified.scheme === REVIEW_SCHEME) ||
          (t.input instanceof vscode.TabInputText &&
            t.input.uri.scheme === REVIEW_SCHEME),
      );
    if (tabs.length > 0) await vscode.window.tabGroups.close(tabs);
    this.fs.clear();
    await vscode.commands.executeCommand("setContext", REVIEW_ACTIVE, false);
    await vscode.commands.executeCommand("setContext", IN_REVIEW_FILE, false);
    if (had) this.changed.fire(undefined);
  }

  async cancel(): Promise<void> {
    if (!this.session) return;
    if (this.hasProgress(this.session)) {
      const answer = await vscode.window.showWarningMessage(
        "Cancel this review?",
        {
          modal: true,
          detail:
            "Nothing has been written to your files; your choices are dropped.",
        },
        "Cancel the review",
      );
      if (answer !== "Cancel the review") return;
    }
    await this.end();
    this.onEnded?.(false);
  }

  private async updateContext(): Promise<void> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const active =
      input instanceof vscode.TabInputTextDiff &&
      input.modified.scheme === REVIEW_SCHEME;
    await vscode.commands.executeCommand("setContext", IN_REVIEW_FILE, active);
  }

  // -- the Review tree ----------------------------------------------------

  private nodes(): Node[] {
    const s = this.session;
    if (!s) return [];
    const out: Node[] = [{ kind: "title", text: reviewTitle(s.plan.steps) }];
    s.queue.items.forEach((_, index) => out.push({ kind: "command", index }));
    if (!s.model) {
      if (s.queue.items.length > 0) {
        out.push({ kind: "runAll" }, { kind: "skip" });
        out.push({
          kind: "note",
          text: "The files to review appear once the commands are done.",
        });
      }
      return out;
    }
    s.model.files.forEach((_, index) => out.push({ kind: "file", index }));
    if (s.model.files.length === 0)
      out.push({
        kind: "note",
        text: "Nothing to review: you already have these changes.",
      });
    out.push(
      { kind: "action", id: "acceptAll" },
      { kind: "action", id: "rejectAll" },
      { kind: "action", id: "finish" },
    );
    return out;
  }

  private item(node: Node): vscode.TreeItem {
    const s = this.session!;
    switch (node.kind) {
      case "title": {
        const item = new vscode.TreeItem(node.text);
        item.iconPath = new vscode.ThemeIcon("git-merge");
        item.description = s.options.repo.split("/")[1] ?? "";
        return item;
      }
      case "command": {
        const { command, state, exitCode } = s.queue.items[node.index]!;
        const item = new vscode.TreeItem(command);
        item.contextValue = `command-${state}`;
        item.description = {
          pending: "",
          running: "running…",
          done: "done",
          failed: `failed (${exitCode})`,
          sent: "sent to your shell",
        }[state];
        item.iconPath = new vscode.ThemeIcon(
          {
            pending: "terminal",
            running: "loading~spin",
            done: "check",
            failed: "error",
            sent: "question",
          }[state],
        );
        item.tooltip =
          state === "sent"
            ? 'Sent to your terminal. Press "I ran it" once it has finished.'
            : "Runs in the Workshop terminal (bash).";
        return item;
      }
      case "runAll": {
        const item = new vscode.TreeItem("Run all commands");
        item.iconPath = new vscode.ThemeIcon("run-all");
        item.command = { command: CMD.runAll, title: "Run all commands" };
        return item;
      }
      case "skip": {
        const item = new vscode.TreeItem("I've done these already, skip");
        item.iconPath = new vscode.ThemeIcon("debug-step-over");
        item.command = { command: CMD.skipCommands, title: "Skip commands" };
        return item;
      }
      case "note": {
        const item = new vscode.TreeItem(node.text);
        item.iconPath = new vscode.ThemeIcon("info");
        return item;
      }
      case "file": {
        const state = s.model!.files[node.index]!;
        const status = s.model!.status(node.index);
        const item = new vscode.TreeItem(state.file.path);
        item.description = `${status}${state.merge.changes.length ? ` · ${state.merge.changes.length} change${state.merge.changes.length === 1 ? "" : "s"}` : ""}`;
        const [icon, color] = STATUS_ICON[status];
        item.iconPath = new vscode.ThemeIcon(
          icon,
          color ? new vscode.ThemeColor(color) : undefined,
        );
        item.contextValue = "reviewFile";
        item.command = {
          command: CMD.openFile,
          title: "Open",
          arguments: [node.index],
        };
        return item;
      }
      case "action": {
        const label = {
          acceptAll: "Accept all",
          rejectAll: "Reject all",
          finish: "Finish",
        }[node.id];
        const item = new vscode.TreeItem(label);
        item.iconPath = new vscode.ThemeIcon(
          {
            acceptAll: "check-all",
            rejectAll: "close-all",
            finish: "git-merge",
          }[node.id],
        );
        item.command = { command: CMD[node.id], title: label };
        return item;
      }
    }
  }

  dispose(): void {
    void this.end();
    this.disposables.forEach((d) => d.dispose());
  }
}

/** Reads the command index out of a tree node passed to an inline action. */
export function commandIndexOf(arg: unknown): number | undefined {
  if (typeof arg === "number") return arg;
  if (
    typeof arg === "object" &&
    arg !== null &&
    (arg as Node).kind === "command"
  )
    return (arg as { index: number }).index;
  return undefined;
}

/** File index from a tree node or a number. */
export function fileIndexOf(arg: unknown): number | undefined {
  if (typeof arg === "number") return arg;
  if (typeof arg === "object" && arg !== null && (arg as Node).kind === "file")
    return (arg as { index: number }).index;
  return undefined;
}

/**
 * Asks for the name and email git commits under and saves them globally, as
 * `git config --global` would. Returns false if they cancel either.
 */
async function askCommitIdentity(root: string): Promise<boolean> {
  const answer = await vscode.window.showInformationMessage(
    "Git doesn't know your name and email yet.",
    {
      modal: true,
      detail:
        "Finish records the step as a commit, and every commit carries a name and email. Nothing has been written yet.",
    },
    "Set them",
  );
  if (answer !== "Set them") return false;
  const name = (
    await vscode.window.showInputBox({
      title: "Your name for git commits",
      prompt:
        "Saved in your global git config, like git config --global user.name.",
      placeHolder: "Uga Georgia",
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "Enter a name."),
    })
  )?.trim();
  if (!name) return false;
  const email = (
    await vscode.window.showInputBox({
      title: "Your email for git commits",
      prompt:
        "Use your GitHub account's email so GitHub links the commits to you.",
      placeHolder: "you@uga.edu",
      ignoreFocusOut: true,
      validateInput: (value) =>
        /^[^\s@]+@[^\s@]+$/.test(value.trim())
          ? undefined
          : "That doesn't look like an email.",
    })
  )?.trim();
  if (!email) return false;
  try {
    await git(root, ["config", "--global", "user.name", name]);
    await git(root, ["config", "--global", "user.email", email]);
    return true;
  } catch (error) {
    logError("identity", error);
    void vscode.window.showErrorMessage(
      `Couldn't save your name and email: ${errorText(error)}`,
    );
    return false;
  }
}
