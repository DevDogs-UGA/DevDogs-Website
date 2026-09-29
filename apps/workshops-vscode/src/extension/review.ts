import * as vscode from "vscode";
import type { ReviewPlan } from "../core/index.js";
import { rangeLabel } from "./scope.js";

/**
 * The seam for TASK-376 (diff editors, Accept/Reject, Finish). The shell
 * builds a `ReviewPlan` from a link or a picked step and hands it here; the
 * next task replaces `StubReviewController` with the real thing, and fills the
 * "Review" view with its own tree.
 */

export interface ReviewStartOptions {
  /** The clone's top level. */
  root: string;
  /** Canonical `Owner/Name`. */
  repo: string;
  /** From `session=` on the link; echo it back to the docs tab after Finish (TASK-378). */
  session: string | undefined;
  /**
   * Call before the review's first commit: puts the attendee on their
   * personal branch (creating or switching, carrying uncommitted work) and
   * tells them. Resolves the branch name, or undefined when they cancelled or
   * git refused (already reported). Nothing is written before Accept, so the
   * controller calls this at the first Accept, not when the review opens.
   */
  ensurePersonalBranch(): Promise<string | undefined>;
}

export interface ReviewController {
  /** Backs the "Review" sidebar view. */
  readonly treeDataProvider: vscode.TreeDataProvider<unknown>;
  /** Begin reviewing `plan`. Replaces any review in progress. */
  start(plan: ReviewPlan, options: ReviewStartOptions): Promise<void>;
}

/** Context key the "Review" view's welcome text and future menus key on. */
export const REVIEW_ACTIVE = "devdogsWorkshops.reviewActive";

/** Says what would be reviewed and nothing else; no diffs, nothing is written. */
export class StubReviewController implements ReviewController {
  readonly treeDataProvider: vscode.TreeDataProvider<unknown> = {
    getTreeItem: () => new vscode.TreeItem(""),
    getChildren: () => [],
  };

  async start(plan: ReviewPlan, options: ReviewStartOptions): Promise<void> {
    const label = rangeLabel(plan.steps);
    const files = plan.files.length;
    const detail = `${files} file${files === 1 ? "" : "s"}${
      plan.commands.length ? `, ${plan.commands.length} command${plan.commands.length === 1 ? "" : "s"}` : ""
    }`;
    await vscode.window.showInformationMessage(
      `${label} (${plan.target.title || plan.target.slug}): ${detail} to review. The diff review isn't in this version yet, and nothing was changed.`
    );
    void options; // root, session and ensurePersonalBranch are for the real controller
  }
}
