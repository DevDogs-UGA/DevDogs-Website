/**
 * `oauth [--device | --loopback] [--base-url <url>] [--platform-url <url>]`:
 * the "Sign in with DevDogs" setup wizard (see `wizard.ts`).
 */
import { flagValue } from "@devdogsuga/cli-core/args";
import { type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { runOAuthSetup } from "./wizard.js";

export const handleOAuth: CommandHandler = async (rest) => {
  const forceDevice = rest.includes("--device");
  const forceLoopback = rest.includes("--loopback");
  if (forceDevice && forceLoopback) {
    process.stderr.write(
      "devtools oauth: --device and --loopback are mutually exclusive — pass at most one.\n",
    );
    process.exitCode = 1;
    return null;
  }
  await runOAuthSetup(
    flagValue(rest, "--base-url"),
    flagValue(rest, "--platform-url"),
    forceDevice ? "device" : forceLoopback ? "loopback" : undefined,
  );
  return 'All done! You\'re ready to "Sign in with DevDogs".';
};
