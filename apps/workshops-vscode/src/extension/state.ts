import type * as vscode from "vscode";
import { readPending, type PendingLink } from "./pending.js";

/**
 * The little the extension remembers, all in `globalState` (per machine, not
 * synced, never sent anywhere): the GitHub username it had to ask for, where
 * each workshop repo's clone lives, and a link parked across a window reload.
 */

const USERNAME = "workshops.githubUsername";
const CLONES = "workshops.clones";
const PENDING = "workshops.pendingLink";

export class State {
  constructor(private readonly memento: vscode.Memento) {}

  get username(): string | undefined {
    return this.memento.get<string>(USERNAME);
  }

  setUsername(name: string): Thenable<void> {
    return this.memento.update(USERNAME, name);
  }

  /** Remembered clone location for a canonical `Owner/Name`. */
  cloneFor(repo: string): string | undefined {
    return this.memento.get<Record<string, string>>(CLONES, {})[
      repo.toLowerCase()
    ];
  }

  rememberClone(repo: string, path: string): Thenable<void> {
    const clones = { ...this.memento.get<Record<string, string>>(CLONES, {}) };
    clones[repo.toLowerCase()] = path;
    return this.memento.update(CLONES, clones);
  }

  get pending(): PendingLink | undefined {
    return readPending(this.memento.get<unknown>(PENDING));
  }

  setPending(link: PendingLink | undefined): Thenable<void> {
    return this.memento.update(PENDING, link);
  }
}
