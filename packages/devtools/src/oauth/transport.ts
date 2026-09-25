/**
 * Chooses which connect transport `devtools oauth`'s one-click branch uses:
 * `loopback` (TASK-351 — a local HTTP listener catches the platform's
 * redirect) or `device` (TASK-352 — a short code, approved in a browser
 * running anywhere, polled for). The device flow's browser step need not run
 * on this machine at all, which is exactly what a loopback redirect cannot
 * offer: nothing can redirect back to a listener the approving browser can't
 * reach.
 *
 * Three ways this gets decided, in order:
 *
 *   1. `--device`/`--loopback` on the command line — an explicit, later
 *      choice always wins over any inference below.
 *   2. The environment: SSH (`SSH_CONNECTION`/`SSH_TTY`), a GitHub Codespace
 *      (`CODESPACES=true`), or a dev container (`REMOTE_CONTAINERS`/
 *      `DEVCONTAINER`) all mean the browser that will approve the
 *      connection is almost certainly NOT running on this machine, so a
 *      loopback redirect would just hang.
 *   3. Neither of the above: try loopback. `wizard.ts` itself handles the
 *      remaining case — the loopback listener failing to start — by
 *      falling back to device at that point, since that failure is only
 *      known once `loopback.ts`'s `start()` has actually been tried.
 */
export type ConnectTransport = "loopback" | "device";

export interface TransportDecision {
  transport: ConnectTransport;
  reason: string;
}

/** Human-readable reason a remote/headless environment was detected, or `null` if none was. */
export function detectRemoteEnvironmentReason(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.SSH_CONNECTION || env.SSH_TTY) {
    return "an SSH session (SSH_CONNECTION/SSH_TTY is set)";
  }
  if (env.CODESPACES === "true") {
    return "a GitHub Codespace (CODESPACES=true)";
  }
  if (env.REMOTE_CONTAINERS || env.DEVCONTAINER) {
    return "a dev container (REMOTE_CONTAINERS/DEVCONTAINER is set)";
  }
  return null;
}

/**
 * Resolves the transport BEFORE a loopback listener is ever attempted.
 * `forceDevice`/`forceLoopback` come from `--device`/`--loopback`; `cli.ts`
 * refuses both being set at once before this is ever called, so at most one
 * is true here.
 */
export function decideTransport({
  forceDevice,
  forceLoopback,
  env = process.env,
}: {
  forceDevice?: boolean;
  forceLoopback?: boolean;
  env?: NodeJS.ProcessEnv;
}): TransportDecision {
  if (forceDevice) {
    return { transport: "device", reason: "--device was passed" };
  }
  if (forceLoopback) {
    return { transport: "loopback", reason: "--loopback was passed" };
  }

  const remoteReason = detectRemoteEnvironmentReason(env);
  if (remoteReason) {
    return { transport: "device", reason: `detected ${remoteReason}` };
  }

  return { transport: "loopback", reason: "no remote environment detected" };
}
