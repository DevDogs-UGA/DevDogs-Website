import * as vscode from "vscode";

/**
 * Holds the two sides of each review diff in memory under its own scheme, so
 * nothing is written to disk until Finish. Left is their file as it is now,
 * right is the proposal; both are read-only. Changing a right side (a decision)
 * fires a change event and the open diff editor redraws by itself.
 */

export const REVIEW_SCHEME = "devdogs-review";

export type Side = "left" | "right";

export function reviewUri(side: Side, path: string): vscode.Uri {
  return vscode.Uri.from({ scheme: REVIEW_SCHEME, path: `/${side}/${path}` });
}

/** `left`/`right` and the repo path back out of a review URI, or undefined for anyone else's. */
export function parseReviewUri(uri: vscode.Uri): { side: Side; path: string } | undefined {
  if (uri.scheme !== REVIEW_SCHEME) return undefined;
  const match = /^\/(left|right)\/(.+)$/.exec(uri.path);
  return match ? { side: match[1] as Side, path: match[2]! } : undefined;
}

interface Entry {
  data: Uint8Array;
  version: number;
}

export class ReviewFs implements vscode.FileSystemProvider {
  private readonly entries = new Map<string, Entry>();
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  private version = 0;

  set(uri: vscode.Uri, text: string): void {
    const existed = this.entries.has(uri.path);
    this.entries.set(uri.path, { data: new TextEncoder().encode(text), version: ++this.version });
    this.emitter.fire([{ type: existed ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
  }

  clear(): void {
    this.entries.clear();
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const entry = this.entries.get(uri.path);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: entry.version,
      size: entry.data.byteLength,
      permissions: vscode.FilePermission.Readonly,
    };
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const entry = this.entries.get(uri.path);
    if (!entry) throw vscode.FileSystemError.FileNotFound(uri);
    return entry.data;
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }
  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
  writeFile(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
  rename(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions(uri);
  }
}
