/**
 * `oauth [--device | --loopback] [--base-url <url>] [--platform-url <url>]`:
 * the "Sign in with DevDogs" setup wizard (see `wizard.ts`).
 */
import { flagValue } from "@devdogsuga/cli-core/args";
import { type CommandHandler } from "@devdogsuga/cli-core/dispatch";
import { currentProduct } from "../product/config.js";
import { ensureGitignored } from "../product/env.js";
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
  // In a product repo the client secret goes where the product keeps its
  // secrets (`.env.tooling`), and that file is made sure to be git-ignored.
  const product = currentProduct();
  if (product && ensureGitignored(product.root, product.config.env.tooling)) {
    process.stderr.write(
      `devtools: added /${product.config.env.tooling} to .gitignore (it holds secrets).\n`,
    );
  }
  await runOAuthSetup(
    flagValue(rest, "--base-url"),
    flagValue(rest, "--platform-url"),
    forceDevice ? "device" : forceLoopback ? "loopback" : undefined,
    undefined,
    product?.config.env.tooling,
  );
  return 'All done! You\'re ready to "Sign in with DevDogs".';
};
