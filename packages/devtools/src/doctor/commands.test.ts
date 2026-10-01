import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCheckoutEnv } from "./commands.js";

describe("readCheckoutEnv", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("lets the local stack's .env.generated win over .env's blank hosted template", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-env-"));
    writeFileSync(
      join(root, ".env"),
      'API_URL="https://$PROJECT_REF.supabase.co"\nPUBLISHABLE_KEY=""\nCRON_SECRET="kept"\n',
    );
    writeFileSync(
      join(root, ".env.generated"),
      'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY="sb_publishable_x"\nDB_URL=""\n',
    );
    expect(readCheckoutEnv(root)).toMatchObject({
      API_URL: "http://127.0.0.1:54321",
      PUBLISHABLE_KEY: "sb_publishable_x",
      CRON_SECRET: "kept",
    });
  });

  it("reads .env alone for a hosted checkout with no local stack", () => {
    root = mkdtempSync(join(tmpdir(), "doctor-env-"));
    writeFileSync(join(root, ".env"), 'API_URL="https://abc.supabase.co"\n');
    expect(readCheckoutEnv(root).API_URL).toBe("https://abc.supabase.co");
  });
});
