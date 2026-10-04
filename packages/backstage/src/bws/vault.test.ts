/**
 * Signing in to the Bitwarden vault from `env`, now that there is no `bw`
 * command of ours to do it by hand.
 *
 * `bw` is faked by a small node script standing in for the bundled CLI
 * (`bwCommand` is mocked to run it): it keeps the vault's state in a file, so
 * "ran `bw login`" is observable as a state change rather than inferred. The
 * prompts are scripted, and the terminal is simulated, because the whole point
 * is what happens at one and what does not happen without one.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scripted = vi.hoisted(() => ({
  confirms: [] as boolean[],
  asked: [] as string[],
  fakeBw: "",
}));

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(async (options: { message: string }) => {
    scripted.asked.push(options.message);
    return scripted.confirms.shift() ?? false;
  }),
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  isCancel: () => false,
  cancel: vi.fn(),
}));

vi.mock("./bw.js", () => ({
  bwCommand: (args: string[]): [string, string[]] => [
    process.execPath,
    [scripted.fakeBw, ...args],
  ],
}));

import {
  forgetVaultSession,
  readTokenFromVault,
  saveTokenToVault,
  VAULT_ITEM_NAME,
  vaultStatus,
} from "./vault.js";

const FAKE_BW = `
const fs = require("node:fs");
const [command, ...rest] = process.argv.slice(2);
const state = process.env.FAKE_BW_STATE;
const read = () => fs.readFileSync(state, "utf8").trim();
const personal = (password) => ({
  name: "DevDogs Secrets Manager access token (admin)",
  type: 1,
  organizationId: null,
  login: { password },
});
if (command === "status") {
  console.log(JSON.stringify({ status: read() }));
} else if (command === "login") {
  fs.writeFileSync(state, "locked");
} else if (command === "unlock") {
  fs.writeFileSync(state, "unlocked");
  process.stdout.write("SESSION");
} else if (command === "list") {
  if (read() !== "unlocked" || !rest.includes("SESSION")) process.exit(1);
  const items = fs.existsSync(state + ".items")
    ? JSON.parse(fs.readFileSync(state + ".items", "utf8"))
    : [personal("0.11111111-1111-1111-1111-111111111111.secret")];
  const search = rest[rest.indexOf("--search") + 1];
  console.log(JSON.stringify(items.filter((i) => i.name.includes(search))));
} else if (command === "create") {
  if (read() !== "unlocked" || !rest.includes("SESSION")) process.exit(1);
  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    fs.writeFileSync(state + ".created", Buffer.from(input, "base64").toString());
  });
} else {
  process.exit(2);
}
`;

let state: string;
const isTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setState(value: string): void {
  writeFileSync(state, value);
}

function setItems(
  items: { name: string; organizationId: string | null; password: string }[],
): void {
  writeFileSync(
    `${state}.items`,
    JSON.stringify(
      items.map(({ password, ...rest }) => ({
        ...rest,
        type: 1,
        login: { password },
      })),
    ),
  );
}

function terminal(on: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", {
    value: on,
    configurable: true,
  });
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "fake-bw-"));
  state = join(dir, "state");
  scripted.fakeBw = join(dir, "bw.cjs");
  writeFileSync(scripted.fakeBw, FAKE_BW);
  process.env.FAKE_BW_STATE = state;
  delete process.env.BW_SESSION;
  forgetVaultSession();
  scripted.confirms = [];
  scripted.asked = [];
  terminal(true);
});

afterEach(() => {
  delete process.env.FAKE_BW_STATE;
  if (isTTY) Object.defineProperty(process.stdin, "isTTY", isTTY);
  else Reflect.deleteProperty(process.stdin, "isTTY");
});

describe("reading the Secrets Manager token from the vault", () => {
  it("signs in, unlocks and reads it, when the person agrees at a terminal", async () => {
    setState("unauthenticated");
    scripted.confirms = [true, true];

    const token = await readTokenFromVault();

    expect(token).toBe("0.11111111-1111-1111-1111-111111111111.secret");
    expect(scripted.asked[0]).toContain("not signed in");
    expect(scripted.asked[1]).toContain("locked");
    expect(readFileSync(state, "utf8")).toBe("unlocked");
  });

  it("does not sign in without asking, and not when told no", async () => {
    setState("unauthenticated");
    scripted.confirms = [false];

    expect(await readTokenFromVault()).toBeUndefined();

    expect(scripted.asked).toHaveLength(1);
    expect(readFileSync(state, "utf8")).toBe("unauthenticated");
  });

  it("never prompts with no terminal: nobody could answer, and a master password would hang", async () => {
    terminal(false);
    setState("unauthenticated");

    expect(await readTokenFromVault()).toBeUndefined();

    expect(scripted.asked).toEqual([]);
    expect(readFileSync(state, "utf8")).toBe("unauthenticated");
  });

  it("leaves a vault that is already signed in alone", async () => {
    setState("locked");
    scripted.confirms = [true];

    await readTokenFromVault();

    // The one question is the unlock, not a sign-in.
    expect(scripted.asked).toHaveLength(1);
    expect(scripted.asked[0]).toContain("locked");
  });

  it("reports the status the fake CLI gives", async () => {
    setState("locked");
    expect(await vaultStatus()).toBe("locked");
  });
});

describe("only the personal vault", () => {
  beforeEach(() => {
    setState("unlocked");
    process.env.BW_SESSION = "SESSION";
  });
  afterEach(() => {
    delete process.env.BW_SESSION;
  });

  it("ignores an organization item of the same name, and reads the personal one", async () => {
    setItems([
      { name: VAULT_ITEM_NAME, organizationId: "org", password: "shared" },
      { name: VAULT_ITEM_NAME, organizationId: null, password: "mine" },
    ]);
    expect(await readTokenFromVault()).toBe("mine");
  });

  it("refuses a token that exists only as an organization item", async () => {
    setItems([
      { name: VAULT_ITEM_NAME, organizationId: "org", password: "shared" },
    ]);
    expect(await readTokenFromVault()).toBeUndefined();
  });

  it("refuses to guess between two personal items", async () => {
    setItems([
      { name: VAULT_ITEM_NAME, organizationId: null, password: "a" },
      { name: VAULT_ITEM_NAME, organizationId: null, password: "b" },
    ]);
    expect(await readTokenFromVault()).toBeUndefined();
  });

  it("matches the name exactly, not by search", async () => {
    setItems([
      { name: `${VAULT_ITEM_NAME} (old)`, organizationId: null, password: "x" },
    ]);
    expect(await readTokenFromVault()).toBeUndefined();
  });

  it("saves with no organization, the token on stdin", async () => {
    expect(await saveTokenToVault("0.tok")).toBe(true);
    const created = JSON.parse(readFileSync(`${state}.created`, "utf8")) as {
      organizationId: unknown;
      collectionIds: unknown;
      login: { password: string };
    };
    expect(created.organizationId).toBeNull();
    expect(created.collectionIds).toBeNull();
    expect(created.login.password).toBe("0.tok");
  });
});
