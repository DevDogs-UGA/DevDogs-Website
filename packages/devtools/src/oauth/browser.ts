/** Opens `url` in the user's default browser, cross-platform. */
import { execFile } from "node:child_process";

export function openBrowser(url: string): void {
  if (process.platform === "win32") {
    execFile("cmd", ["/c", "start", "", url]);
  } else if (process.platform === "darwin") {
    execFile("open", [url]);
  } else {
    execFile("xdg-open", [url]);
  }
}
