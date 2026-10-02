/**
 * Puts a Send link on the clipboard. Only ever a link: the one thing `creds`
 * hands the officer to paste into a message.
 *
 * Best effort. No clipboard tool is a missing convenience, not a failure, and
 * the link is printed anyway.
 */
import { spawn } from "node:child_process";

function candidates(): [string, string[]][] {
  if (process.platform === "darwin") return [["pbcopy", []]];
  if (process.platform === "win32") return [["clip", []]];
  return [
    // WSL first: the Windows clipboard is the one the browser pastes from.
    ...(process.env.WSL_DISTRO_NAME
      ? [["clip.exe", []] as [string, string[]]]
      : []),
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
  ];
}

function tryCopy(command: string, args: string[], text: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"],
      shell: false,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.on("error", () => undefined);
    child.stdin.end(text);
  });
}

export async function copyLink(link: string): Promise<boolean> {
  for (const [command, args] of candidates()) {
    if (await tryCopy(command, args, link)) return true;
  }
  return false;
}
