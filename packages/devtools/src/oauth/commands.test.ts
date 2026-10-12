import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProduct } from "../product/fixtures.js";

const { runOAuthSetup } = vi.hoisted(() => ({ runOAuthSetup: vi.fn() }));
vi.mock("./wizard.js", () => ({ runOAuthSetup }));

import { handleOAuth } from "./commands.js";

describe("devtools oauth in a product repo", () => {
  const start = process.cwd();
  afterEach(() => {
    process.chdir(start);
    runOAuthSetup.mockReset();
  });

  it("runs from the product root even when started in a subdirectory", async () => {
    const product = makeProduct();
    const sub = join(product.root, "lib", "deep");
    mkdirSync(sub, { recursive: true });
    process.chdir(sub);
    let cwdSeen = "";
    runOAuthSetup.mockImplementation(() => {
      cwdSeen = process.cwd();
      return Promise.resolve();
    });

    await handleOAuth([]);

    expect(realpathSync(cwdSeen)).toBe(realpathSync(product.root));
    expect(runOAuthSetup).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      product.config.env.tooling,
    );
  });
});
