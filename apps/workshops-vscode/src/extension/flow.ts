import { stat } from "node:fs/promises";
import * as vscode from "vscode";
import {
  inferStepFromWorkingTree,
  planReview,
  revParse,
  showFile,
  tagRef,
  type Step,
} from "../core/index.js";
import type { Branches } from "./branches.js";
import { locateClone } from "./clone.js";
import { errorText, logError, output } from "./log.js";
import { resolveInside, repoRelative } from "./paths.js";
import { fetchTags, loadSnapshot } from "./repo.js";
import type { ReviewController } from "./review.js";
import {
  decideBase,
  planIsEmpty,
  rangeLabel,
  restrictPlanToFile,
} from "./scope.js";
import type { State } from "./state.js";
import { stepLabel } from "./steps-model.js";
import { captureError } from "./telemetry.js";
import { parseWorkshopUri, type OpenLink, type ReviewLink } from "./uri.js";

/**
 * What happens when a link arrives or a step is picked: find the clone, fetch
 * tags (the only automatic write, and only to `.git`), work out which steps
 * are being reviewed, build the plan and hand it to the review controller.
 * Nothing touches the attendee's files here.
 */

/** Read-only view of a file as it is at a step's tag, for `open` links to a file they don't have. */
export const REF_SCHEME = "devdogs-workshop-ref";

export class Flow {
  constructor(
    private readonly state: State,
    private readonly branches: Branches,
    private readonly review: ReviewController,
    private readonly refresh: () => void,
  ) {}

  /** Entry for `vscode://devdogsuga.workshops/...`. */
  async handleLink(path: string, query: string): Promise<void> {
    const parsed = parseWorkshopUri(path, query);
    if (!parsed.ok) {
      void vscode.window.showErrorMessage(
        `DevDogs Workshops: ${parsed.reason}`,
      );
      return;
    }
    const { link } = parsed;
    const located = await locateClone(link.repo, this.state, { path, query });
    if (located.kind !== "here") return;
    await this.fetch(located.root);
    if (link.action === "review") await this.reviewLink(located.root, link);
    else await this.openLink(located.root, link);
  }

  /** Runs after a reload if a link was parked before it. */
  async resume(path: string, query: string): Promise<void> {
    await this.handleLink(path, query);
  }

  /** `git fetch origin --tags`. Offline or no origin is fine: local tags still work. */
  private async fetch(root: string): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: "Fetching workshop steps…",
        },
        () => fetchTags(root),
      );
    } catch (error) {
      logError("fetch", error);
      output.appendLine("Continuing with the tags already in this clone.");
    }
    this.refresh();
  }

  private async reviewLink(root: string, link: ReviewLink): Promise<void> {
    await this.reviewTo(root, link.repo, link.to, {
      from: link.from,
      file: link.file,
      session: link.session,
    });
  }

  /**
   * Starts a review up to `toTag`. `from` (a link's explicit range) skips the
   * "which step are you at?" guesswork; `file` narrows to one file.
   */
  async reviewTo(
    root: string,
    repo: string,
    toTag: string,
    options: {
      from?: string | undefined;
      file?: string | undefined;
      session?: string | undefined;
    } = {},
  ): Promise<void> {
    try {
      const snap = await loadSnapshot(root);
      const { line } = snap;
      const target = line.find((s) => s.tag === toTag);
      if (!target) {
        void vscode.window.showErrorMessage(
          `This clone doesn't have the step "${toTag}". Fetch the latest tags (git fetch origin --tags) or update the DevDogs Workshops extension.`,
        );
        return;
      }

      let file: string | undefined;
      if (options.file !== undefined) {
        file = repoRelative(root, options.file) ?? undefined;
        if (!file) {
          void vscode.window.showErrorMessage(
            "That link points outside your clone, so it was ignored.",
          );
          return;
        }
      }

      let base: Step | undefined;
      let explicit = false;
      if (options.from !== undefined) {
        base = line.find((s) => s.tag === options.from);
        explicit = true;
        if (!base) {
          void vscode.window.showErrorMessage(
            `This clone doesn't have the step "${options.from}".`,
          );
          return;
        }
      } else {
        base = snap.current ?? (await this.confirmInferred(root, line, target));
      }
      if (!base) return;

      const decision = decideBase(line, target, base, explicit);
      if (decision.kind === "up-to-date") {
        void vscode.window.showInformationMessage(
          `You already have "${target.title || target.slug}".`,
        );
        return;
      }
      if (decision.kind === "ready") base = decision.base;
      else {
        const range = rangeLabel(
          line.slice(
            indexOfTag(line, decision.combined) + 1,
            indexOfTag(line, target) + 1,
          ),
        );
        const together = `Review ${range.charAt(0).toLowerCase()}${range.slice(1)} together`;
        const answer = await vscode.window.showInformationMessage(
          `You last had "${decision.combined.title || "the start"}". ${together}?`,
          {
            modal: true,
            detail:
              "Skipped steps are included, so nothing they add is missed.",
          },
          together,
          `Just ${rangeLabel([target]).toLowerCase()}`,
        );
        if (!answer) return;
        base = answer === together ? decision.combined : decision.single;
      }

      let plan = await planReview(root, line, base, target);
      if (file !== undefined) {
        plan = restrictPlanToFile(plan, file);
        if (planIsEmpty(plan)) {
          void vscode.window.showInformationMessage(
            `"${file}" isn't changed by this step.`,
          );
          return;
        }
      }
      await this.review.start(plan, {
        root,
        repo,
        session: options.session,
        line,
        ensurePersonalBranch: () =>
          this.branches.ensurePersonalBranch(root, target.workshop),
      });
    } catch (error) {
      captureError("reviewTo", error);
      logError("reviewTo", error);
      void vscode.window.showErrorMessage(
        `Couldn't start the review: ${errorText(error)}`,
      );
    }
  }

  /**
   * No step tag in their history (they typed along without merging): guess,
   * then ask. A guess of the very first step needs no question.
   */
  private async confirmInferred(
    root: string,
    line: readonly Step[],
    target: Step,
  ): Promise<Step | undefined> {
    const upTo = line.slice(0, line.indexOf(target) + 1);
    const guess = await inferStepFromWorkingTree(root, upTo);
    if (guess.step.tag === upTo[0]?.tag) return guess.step;
    const label =
      guess.step.number === 0
        ? `the start of ${guess.step.workshop}`
        : `step ${guess.step.number}, "${guess.step.title}"`;
    const answer = await vscode.window.showInformationMessage(
      `Looks like you're at ${label}. Right?`,
      {
        modal: true,
        detail:
          "This clone has no step history yet, so this is a guess from your files. If unsure, pick an earlier step: nothing you already have is lost.",
      },
      "Yes",
      "Pick a step…",
    );
    if (answer === "Yes") return guess.step;
    if (answer !== "Pick a step…") return undefined;
    const picked = await vscode.window.showQuickPick(
      upTo.slice(0, -1).map((step) => ({
        label:
          step.number === 0 ? `Start of ${step.workshop}` : stepLabel(step),
        description: step.workshop,
        step,
      })),
      {
        title: "Which step do you already have?",
        placeHolder: "The last step you finished",
      },
    );
    return picked?.step;
  }

  /** `open` links: show the file from their clone with the lines selected. */
  private async openLink(root: string, link: OpenLink): Promise<void> {
    const abs = resolveInside(root, link.file);
    const rel = repoRelative(root, link.file);
    if (!abs || !rel) {
      void vscode.window.showErrorMessage(
        "That link points outside your clone, so it was ignored.",
      );
      return;
    }
    if (!(await revParse(root, tagRef(link.ref)))) {
      void vscode.window.showErrorMessage(
        `This clone doesn't have the step "${link.ref}". Fetch the latest tags and try again.`,
      );
      return;
    }

    let uri: vscode.Uri;
    if (await isFile(abs)) {
      uri = vscode.Uri.file(abs);
    } else {
      const answer = await vscode.window.showInformationMessage(
        `${rel} isn't in your clone yet. Show it as it is at "${link.ref}"?`,
        "Show",
      );
      if (answer !== "Show") return;
      uri = vscode.Uri.from({
        scheme: REF_SCHEME,
        path: `/${rel}`,
        query: JSON.stringify({ root, ref: link.ref }),
      });
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, {
      preview: true,
    });
    if (link.lines) {
      const last = document.lineCount - 1;
      const start = Math.min(link.lines.start - 1, last);
      const end = Math.min(link.lines.end - 1, last);
      const range = new vscode.Range(
        start,
        0,
        end,
        document.lineAt(end).range.end.character,
      );
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
  }
}

function indexOfTag(line: readonly Step[], step: Step): number {
  return line.findIndex((s) => s.tag === step.tag);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Serves `git show refs/tags/<ref>:<path>` for `REF_SCHEME` documents (read-only). */
export const refContentProvider: vscode.TextDocumentContentProvider = {
  async provideTextDocumentContent(uri) {
    try {
      const { root, ref } = JSON.parse(uri.query) as {
        root: string;
        ref: string;
      };
      const rel = repoRelative(root, uri.path.replace(/^\//, ""));
      if (!rel) return "";
      const bytes = await showFile(root, tagRef(ref), rel);
      return bytes
        ? bytes.toString("utf8")
        : "(This file doesn't exist at that step.)";
    } catch (error) {
      return `Couldn't read this file: ${errorText(error)}`;
    }
  },
};
