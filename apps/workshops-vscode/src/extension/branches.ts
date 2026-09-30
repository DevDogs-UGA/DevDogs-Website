import { execFile } from "node:child_process";
import * as vscode from "vscode";
import {
  applyBranchPlan,
  currentBranch,
  isValidUsername,
  jumpToStep,
  localBranches,
  planPersonalBranch,
  readSteps,
  listWorkshops,
} from "../core/index.js";
import { errorText, logError } from "./log.js";
import type { State } from "./state.js";
import { resolveUsername, type UsernameSource } from "./username.js";

/**
 * The vscode side of personal branches: finding the GitHub username, and
 * asking `core/branches` where a review's commits should go. The decisions
 * live in core; this only gathers inputs and tells the attendee what happened.
 */

function ghLogin(): Promise<string | undefined> {
  return new Promise((resolve) => {
    // `gh` is optional: not installed, not logged in, or slow all just mean "no answer".
    execFile(
      "gh",
      ["api", "user", "--jq", ".login"],
      { timeout: 5000, windowsHide: true },
      (error, stdout) => resolve(error ? undefined : stdout.trim()),
    );
  });
}

export class Branches {
  constructor(private readonly state: State) {}

  /** Signed-in GitHub login, then `gh`, then what we remembered, then ask once. */
  async username(): Promise<string | undefined> {
    const sources: UsernameSource[] = [
      async () => {
        const session = await vscode.authentication.getSession(
          "github",
          ["read:user"],
          { silent: true },
        );
        return session?.account.label;
      },
      ghLogin,
      async () => this.state.username,
      async () => {
        const answer = await vscode.window.showInputBox({
          title: "Your GitHub username",
          prompt:
            "Your work goes on a branch named <username>/<workshop>. Asked once; stored on this machine only.",
          placeHolder: "octocat",
          ignoreFocusOut: true,
          validateInput: (value) =>
            isValidUsername(value.trim())
              ? undefined
              : "That doesn't look like a GitHub username.",
        });
        const name = answer?.trim();
        if (name && isValidUsername(name)) await this.state.setUsername(name);
        return name;
      },
    ];
    return resolveUsername(sources);
  }

  /**
   * Puts them on their personal branch for `workshop` before a review's first
   * commit. On a workshop branch or detached HEAD this creates or switches,
   * keeping uncommitted work, and says so; on a branch of their own it does
   * nothing. Returns the branch to commit on, or undefined on cancel/failure.
   */
  async ensurePersonalBranch(
    root: string,
    workshop: string,
  ): Promise<string | undefined> {
    const user = await this.username();
    if (!user) return undefined;
    try {
      const [branch, branches, workshops, steps] = await Promise.all([
        currentBranch(root),
        localBranches(root),
        listWorkshops(root),
        readSteps(root, workshop),
      ]);
      const plan = planPersonalBranch({
        user,
        workshop,
        currentBranch: branch,
        workshops,
        localBranches: branches,
        previousWorkshop: steps.find((s) => s.number === 0)?.start,
      });
      await applyBranchPlan(root, plan);
      if (plan.kind === "create") {
        void vscode.window.showInformationMessage(
          `Your work now lives on ${plan.branch} (started from ${plan.start.name}). Your uncommitted changes came along.`,
        );
      } else if (plan.kind === "switch") {
        void vscode.window.showInformationMessage(
          `Switched to ${plan.branch}, your branch for this workshop. Your uncommitted changes came along.`,
        );
      }
      return plan.branch;
    } catch (error) {
      logError("ensurePersonalBranch", error);
      void vscode.window.showErrorMessage(
        `Couldn't move you to your own branch: ${errorText(error)} Commit or stash your changes, then try again.`,
      );
      return undefined;
    }
  }

  /**
   * "Jump to step": the escape hatch. Confirms first, because it throws away
   * uncommitted changes to tracked files (as the demo laptops do).
   */
  async jumpToStep(
    root: string,
    tag: string,
    title: string,
  ): Promise<string | undefined> {
    const user = await this.username();
    if (!user) return undefined;
    const confirm = await vscode.window.showWarningMessage(
      `Jump to "${title}"?`,
      {
        modal: true,
        detail:
          "Your branch is moved to this step and every uncommitted change to tracked files is discarded. " +
          "New files you haven't added stay. This can't be undone.",
      },
      "Jump and discard my changes",
    );
    if (!confirm) return undefined;
    try {
      const branch = await jumpToStep(root, user, tag);
      void vscode.window.showInformationMessage(
        `You're on ${branch} at ${title}.`,
      );
      return branch;
    } catch (error) {
      logError("jumpToStep", error);
      void vscode.window.showErrorMessage(
        `Couldn't jump to that step: ${errorText(error)}`,
      );
      return undefined;
    }
  }
}
