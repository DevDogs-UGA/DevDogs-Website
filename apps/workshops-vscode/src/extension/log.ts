import * as vscode from "vscode";

/** One output channel for everything the shell does; nothing here leaves the machine. */
export const output = vscode.window.createOutputChannel("DevDogs Workshops");

export function logError(context: string, error: unknown): void {
  const line = `${context}: ${error instanceof Error ? error.message : String(error)}`;
  output.appendLine(line);
  // The integration test can't see the output channel; it sets this to read errors from stdout.
  if (process.env["DEVDOGS_WORKSHOPS_DEBUG"])
    console.error(`[workshops] ${line}`);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
