import type * as vscode from "vscode";
import type { ReviewPlan, Step } from "../core/index.js";

/**
 * The seam between "a link or click named a step" (`Flow`) and the review UI
 * (`WorkshopReviewController`). The shell builds a `ReviewPlan` and hands it
 * over; everything after that, diffs, decisions, commands and Finish, lives
 * behind this interface.
 */

export interface ReviewStartOptions {
  /** The clone's top level. */
  root: string;
  /** Canonical `Owner/Name`. */
  repo: string;
  /** From `session=` on the link; echoed back to the docs tab after Finish. */
  session: string | undefined;
  /** The whole step line, for finding the next step's docs page after Finish. */
  line: readonly Step[];
  /**
   * Called at the review's first write, not when it opens (nothing is written
   * before Accept): puts the attendee on their personal branch, carrying
   * uncommitted work, and tells them. Resolves the branch name, or undefined
   * when they cancelled or git refused (already reported).
   */
  ensurePersonalBranch(): Promise<string | undefined>;
}

export interface ReviewController {
  /** Backs the "Review" sidebar view. */
  readonly treeDataProvider: vscode.TreeDataProvider<unknown>;
  /** Begin reviewing `plan`. Replaces any review in progress (after asking, if it has progress). */
  start(plan: ReviewPlan, options: ReviewStartOptions): Promise<void>;
}

/** Context key: a review is open (the Review view's welcome text hides). */
export const REVIEW_ACTIVE = "devdogsWorkshops.reviewActive";
