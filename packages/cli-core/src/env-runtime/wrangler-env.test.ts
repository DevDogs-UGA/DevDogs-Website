import { readFileSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderWranglerEnvFile, writeWranglerEnvFile } from "./wrangler-env.js";

describe("wrangler env file", () => {
  it("single-quotes values so multiline keys survive", () => {
    expect(renderWranglerEnvFile({ A: "1", KEY: "-----\nabc\\n" })).toBe(
      "A='1'\nKEY='-----\nabc\\n'\n",
    );
  });

  it("writes a private file and removes it", async () => {
    const file = await writeWranglerEnvFile({ A: "1" });
    expect(readFileSync(file.path, "utf8")).toBe("A='1'\n");
    if (process.platform !== "win32") {
      expect(statSync(file.path).mode & 0o777).toBe(0o600);
    }
    file.remove();
    file.remove();
    expect(existsSync(file.path)).toBe(false);
  });
});
