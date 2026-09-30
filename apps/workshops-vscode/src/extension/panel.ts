import * as vscode from "vscode";
import { isWorkshopBranch } from "../core/index.js";
import { findWorkspaceClone } from "./clone.js";
import { logError } from "./log.js";
import { loadSnapshot, type Snapshot } from "./repo.js";
import { buildStepsModel, stepLabel, type StepRow } from "./steps-model.js";

/**
 * The Workshop sidebar: a header ("Step 3 of 6"), a warning when they are on
 * a workshop's own branch, and every step of the open repo. Clicking a step
 * is the picker: it starts a review to that step.
 */

export const CMD = {
  reviewToStep: "devdogsWorkshops.reviewToStep",
  goToStep: "devdogsWorkshops.goToStep",
  jumpToStep: "devdogsWorkshops.jumpToStep",
  moveMyWork: "devdogsWorkshops.moveMyWork",
  refresh: "devdogsWorkshops.refresh",
} as const;

export interface OpenRepo {
  root: string;
  repo: string;
  snapshot: Snapshot;
}

type Node =
  | { kind: "header"; text: string; description: string }
  | { kind: "warning"; branch: string | null }
  | { kind: "step"; row: StepRow };

export class StepsProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private current: OpenRepo | undefined;

  /** The repo the panel is showing, as of the last refresh. */
  get open(): OpenRepo | undefined {
    return this.current;
  }

  /** Re-reads git. Cheap, so callers refresh on HEAD changes, focus and after every command. */
  async refresh(): Promise<void> {
    try {
      const found = await findWorkspaceClone();
      this.current = found
        ? { ...found, snapshot: await loadSnapshot(found.root) }
        : undefined;
    } catch (error) {
      logError("refresh", error);
      this.current = undefined;
    }
    const hasSteps = (this.current?.snapshot.line.length ?? 0) > 0;
    await vscode.commands.executeCommand(
      "setContext",
      "devdogsWorkshops.hasWorkshop",
      hasSteps,
    );
    this.changed.fire(undefined);
  }

  getChildren(): Node[] {
    const open = this.current;
    if (!open || open.snapshot.line.length === 0) return [];
    const { snapshot } = open;
    const model = buildStepsModel(snapshot.line, snapshot.current);
    const nodes: Node[] = [
      {
        kind: "header",
        text: model.header,
        description: open.repo.split("/")[1] ?? open.repo,
      },
    ];
    if (isWorkshopBranch(snapshot.branch, snapshot.workshops)) {
      nodes.push({ kind: "warning", branch: snapshot.branch });
    }
    for (const row of model.rows) nodes.push({ kind: "step", row });
    return nodes;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "header") {
      const item = new vscode.TreeItem(node.text);
      item.description = node.description;
      item.iconPath = new vscode.ThemeIcon("mortar-board");
      item.contextValue = "header";
      return item;
    }
    if (node.kind === "warning") {
      const where = node.branch
        ? `the workshop's own branch (${node.branch})`
        : "a detached checkout";
      const item = new vscode.TreeItem("You're on the workshop's own branch…");
      item.description = "Move my work";
      item.tooltip = `You're on ${where}. Your changes should live on your own branch, <you>/<workshop>, so pulling never mixes them with the solution. Click to move your work there; uncommitted changes come along.`;
      item.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("list.warningForeground"),
      );
      item.contextValue = "warning";
      item.command = { command: CMD.moveMyWork, title: "Move my work" };
      return item;
    }
    const { step, state } = node.row;
    const item = new vscode.TreeItem(stepLabel(step));
    item.description = state === "current" ? "you are here" : step.workshop;
    item.iconPath = new vscode.ThemeIcon(
      state === "done"
        ? "check"
        : state === "current"
          ? "circle-filled"
          : "circle-outline",
      state === "current" ? new vscode.ThemeColor("charts.green") : undefined,
    );
    item.tooltip = new vscode.MarkdownString(
      [
        `**${step.title || step.slug}**`,
        ...step.run.map((cmd) => `- \`${cmd}\``),
      ].join("\n"),
    );
    item.contextValue = "step";
    item.command = {
      command: CMD.reviewToStep,
      title: "Review to this step",
      arguments: [step.tag],
    };
    return item;
  }
}

/** Reads the tag out of what a tree menu or a click passes. */
export function tagOf(arg: unknown): string | undefined {
  if (typeof arg === "string") return arg;
  if (typeof arg === "object" && arg !== null) {
    const row = (arg as { row?: StepRow }).row;
    if (row) return row.step.tag;
  }
  return undefined;
}
