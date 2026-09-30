import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import { errorText, logError, output } from "./log.js";
import type { PendingLink } from "./pending.js";
import { cloneRepo, cloneRootIfMatches } from "./repo.js";
import { ALLOWED_REPOS } from "./uri.js";
import type { State } from "./state.js";

/**
 * Finding (or getting) the attendee's clone of a workshop repo. The clone is
 * theirs and lives wherever they put it, so this never guesses a location:
 * it checks the open folders, then a place they told us before, then asks.
 */

export interface WorkspaceClone {
  root: string;
  repo: string;
}

/** The first open folder that is a clone of `repo` (or of any allowlisted repo). */
export async function findWorkspaceClone(
  repo?: string,
): Promise<WorkspaceClone | undefined> {
  const wanted = repo ? [repo] : [...ALLOWED_REPOS];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    if (folder.uri.scheme !== "file") continue;
    for (const candidate of wanted) {
      const root = await cloneRootIfMatches(folder.uri.fsPath, candidate);
      if (root) return { root, repo: candidate };
    }
  }
  return undefined;
}

export type Located =
  | { kind: "here"; root: string }
  /** A folder was opened; the window reloads and the parked link resumes. */
  | { kind: "reloading" }
  | { kind: "cancelled" };

/**
 * Where is the clone of `repo`? In the open folders: done. Otherwise it needs
 * a different window, so the link is parked in globalState first (opening a
 * folder restarts the extension host) and resumed after activation.
 */
export async function locateClone(
  repo: string,
  state: State,
  link: Omit<PendingLink, "savedAt">,
): Promise<Located> {
  const open = await findWorkspaceClone(repo);
  if (open) return { kind: "here", root: open.root };

  const remembered = state.cloneFor(repo);
  if (
    remembered &&
    existsSync(remembered) &&
    (await cloneRootIfMatches(remembered, repo))
  ) {
    return openFolder(remembered, repo, state, link);
  }

  const choice = await vscode.window.showInformationMessage(
    `This link is for ${repo}, but it isn't open in this window.`,
    {
      modal: true,
      detail:
        "Open the folder where you cloned it, or clone it now. Nothing is changed until you accept a change.",
    },
    "Open a folder…",
    "Clone it",
  );
  if (choice === "Open a folder…") {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: `Open ${repo.split("/")[1]} clone`,
      title: `Your clone of ${repo}`,
    });
    const dir = picked?.[0]?.fsPath;
    if (!dir) return { kind: "cancelled" };
    const root = await cloneRootIfMatches(dir, repo);
    if (!root) {
      void vscode.window.showErrorMessage(
        `That folder isn't a clone of ${repo}.`,
      );
      return { kind: "cancelled" };
    }
    return openFolder(root, repo, state, link);
  }
  if (choice === "Clone it") {
    const cloned = await cloneInteractively(repo);
    return cloned
      ? openFolder(cloned, repo, state, link)
      : { kind: "cancelled" };
  }
  return { kind: "cancelled" };
}

/** Always asks where to put it; never clones somewhere by default. */
async function cloneInteractively(repo: string): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Clone here",
    title: `Choose a folder to clone ${repo} into`,
  });
  const parent = picked?.[0]?.fsPath;
  if (!parent) return undefined;
  const target = join(parent, basename(repo));
  if (existsSync(target)) {
    void vscode.window.showErrorMessage(
      `${target} already exists. Choose another folder, or use "Open a folder…".`,
    );
    return undefined;
  }
  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Cloning ${repo}…`,
      },
      () => cloneRepo(repo, dirname(target)),
    );
  } catch (error) {
    logError("clone", error);
    void vscode.window.showErrorMessage(`Cloning failed: ${errorText(error)}`);
    return undefined;
  }
}

async function openFolder(
  root: string,
  repo: string,
  state: State,
  link: Omit<PendingLink, "savedAt">,
): Promise<Located> {
  await state.rememberClone(repo, root);
  // Park the link before the window reloads; it resumes in activate().
  await state.setPending({ ...link, savedAt: Date.now() });
  output.appendLine(`Opening ${root} to continue a workshop link.`);
  await vscode.commands.executeCommand(
    "vscode.openFolder",
    vscode.Uri.file(root),
    { forceNewWindow: false },
  );
  return { kind: "reloading" };
}
