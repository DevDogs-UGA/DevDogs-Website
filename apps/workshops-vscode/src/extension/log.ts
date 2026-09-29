import * as vscode from "vscode";

/** One output channel for everything the shell does; nothing here leaves the machine. */
export const output = vscode.window.createOutputChannel("DevDogs Workshops");

export function logError(context: string, error: unknown): void {
  output.appendLine(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
