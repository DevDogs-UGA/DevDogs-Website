/** Opens `url` in the user's default browser, cross-platform. */
import { spawnProcess } from "@devdogsuga/cli-core/spawn";

export function openBrowser(url: string): void {
  const [command, args] = browserCommand(url, process.platform);
  // Detached, output dropped, and an `error` handler so a machine with no
  // `xdg-open` prints nothing instead of crashing on an unhandled event: the
  // wizard always prints the URL as well.
  spawnProcess(command, args, { stdio: "ignore", detached: true })
    .on("error", () => undefined)
    .unref();
}

/**
 * The program that opens `url`. Windows uses `rundll32`, a real executable, not
 * `cmd /c start`: through `cmd.exe` an `&` in the URL ends the command and
 * starts another, which truncates every OAuth authorize URL at its first query
 * parameter.
 */
export function browserCommand(
  url: string,
  platform: NodeJS.Platform,
): [string, string[]] {
  if (platform === "win32") {
    return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  }
  if (platform === "darwin") return ["open", [url]];
  return ["xdg-open", [url]];
}
