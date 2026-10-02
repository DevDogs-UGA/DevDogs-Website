/**
 * `creds` end to end against a fake `bw`, with a sentinel password.
 *
 * The fake keeps the collection and the Sends in memory and answers the same
 * argv and base64-on-stdin shapes the real CLI does. Every run captures
 * stdout, stderr, the failure log `cli-core` would write, what went to Sentry,
 * every argv handed to `bw`, and what was sent to Linear, and the sentinel
 * must appear in none of them. It must appear in exactly one place: the Send
 * body, which is where it is meant to go.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reported = vi.hoisted(() => [] as unknown[]);
vi.mock("@devdogsuga/cli-core/telemetry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reportDevtoolsError: (err: unknown) => reported.push(err),
}));

import { renderFailureLog } from "@devdogsuga/cli-core/failure-log";
import { SharedVault, type BwResult, type SendJson } from "./bitwarden.js";
import { forgetRoster, runCreds, type CredsDeps } from "./commands.js";
import type { BwItem } from "./item.js";
import type { RosterRow } from "./roster.js";
import { forgetSecrets } from "./secrets.js";

const SENTINEL = "SENTINEL-p4ssw0rd-9f8e7d";
const NOW = new Date("2026-10-05T12:00:00Z");

class FakeBw {
  items = new Map<string, BwItem>();
  sends = new Map<string, SendJson>();
  argv: string[][] = [];
  /** A command that fails, echoing its input to stderr the way a careless CLI might. */
  failOn: string | undefined;
  private next = 1;

  constructor() {
    this.items.set("canva", {
      id: "canva",
      organizationId: "org",
      collectionIds: ["col"],
      name: "Canva",
      notes: "Team workspace only",
      type: 1,
      login: {
        username: "devdogs@uga.edu",
        password: SENTINEL,
        totp: null,
        uris: [{ uri: "https://canva.com" }],
      },
      fields: [
        { name: "Recipients", value: "sf12345@uga.edu", type: 0 },
        { name: "Owner", value: "Sloan", type: 0 },
      ],
    });
    // Outside the collection: must never be listed or touched.
    this.items.set("personal", {
      id: "personal",
      organizationId: null,
      collectionIds: [],
      name: "My bank",
      notes: null,
      type: 1,
      login: { username: "me", password: "not-shared", totp: null },
    });
  }

  run = async (args: string[], stdin?: string): Promise<BwResult> => {
    this.argv.push(args);
    const ok = (value: unknown): BwResult => ({
      code: 0,
      stdout: JSON.stringify(value),
      stderr: "",
    });
    const decoded = stdin
      ? (JSON.parse(Buffer.from(stdin, "base64").toString()) as Record<
          string,
          unknown
        >)
      : {};
    const key = args.slice(0, 2).join(" ");
    if (this.failOn === key) {
      return {
        code: 1,
        stdout: "",
        stderr: `Error: could not save ${JSON.stringify(decoded)}`,
      };
    }
    switch (key) {
      case "sync":
        return { code: 0, stdout: "Syncing complete.", stderr: "" };
      case "status":
        return ok({ userEmail: "officer@uga.edu", status: "unlocked" });
      case "list collections":
        return ok([
          { id: "col", organizationId: "org", name: "Shared Accounts" },
        ]);
      case "list items":
        return ok(
          [...this.items.values()].filter((i) =>
            i.collectionIds?.includes(args[3]!),
          ),
        );
      case "create item": {
        const item = {
          ...(decoded as unknown as BwItem),
          id: `item-${this.next++}`,
        };
        this.items.set(item.id, item);
        return ok(item);
      }
      case "edit item": {
        const item = decoded as unknown as BwItem;
        this.items.set(args[2]!, item);
        return ok(item);
      }
      case "send get": {
        const send = this.sends.get(args[2]!);
        return send ? ok(send) : { code: 1, stdout: "", stderr: "Not found." };
      }
      case "send create": {
        const id = `send-${this.next++}`;
        const send = {
          ...decoded,
          id,
          accessUrl: `https://send.bitwarden.com/#${id}/key`,
        } as SendJson;
        this.sends.set(id, send);
        return ok(send);
      }
      case "send edit": {
        const send = decoded as unknown as SendJson;
        this.sends.set(send.id, send);
        return ok(send);
      }
      default:
        return {
          code: 1,
          stdout: "",
          stderr: `unknown command ${args.join(" ")}`,
        };
    }
  };
}

const ROWS: RosterRow[] = [
  {
    userId: "u1",
    name: "Sloan Finger",
    ugaEmail: "sf12345@uga.edu",
    authEmail: null,
    roles: ["DevOps Director"],
    ranks: [300],
  },
  {
    userId: "u2",
    name: "Pat President",
    ugaEmail: "pp11111@uga.edu",
    authEmail: null,
    roles: ["President"],
    ranks: [100],
  },
];

let bw: FakeBw;
let out: string;
let err: string;
let linearBodies: string[];
let copied: string[];

function deps(extra: Partial<CredsDeps> = {}): CredsDeps {
  return {
    now: () => NOW,
    vault: async () => new SharedVault(bw.run),
    rosterQuery: async () => ROWS,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      linearBodies.push(init?.body as string);
      return new Response(
        JSON.stringify({
          data: {
            documentUpdate: {
              success: true,
              document: { url: "https://linear.app/doc" },
            },
          },
        }),
      );
    },
    copy: async (link) => {
      copied.push(link);
      return true;
    },
    readStdin: async () => `${SENTINEL}\n`,
    ...extra,
  };
}

/** Everything that could have leaked, as one string. */
function everywhere(): string {
  const log = renderFailureLog({
    argv: ["creds"],
    code: 1,
    ran: [],
    output: out + err,
    error: reported[0],
    eventId: undefined,
    now: NOW,
    env: {},
  });
  return [
    out,
    err,
    log,
    JSON.stringify(bw.argv),
    linearBodies.join("\n"),
    copied.join("\n"),
    reported
      .map((e) => `${(e as Error).message}\n${(e as Error).stack}`)
      .join("\n"),
  ].join("\n");
}

beforeEach(() => {
  bw = new FakeBw();
  out = "";
  err = "";
  linearBodies = [];
  copied = [];
  reported.length = 0;
  forgetRoster();
  forgetSecrets();
  process.exitCode = undefined;
  process.env.LINEAR_API_KEY = "lin_api_test_key";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LINEAR_API_KEY;
  process.exitCode = undefined;
});

describe("creds send", () => {
  it("makes one email-verified Send, records it on the item, and never prints the password", async () => {
    await runCreds(
      [
        "send",
        "--item",
        "Canva",
        "--role",
        "President",
        "--to",
        "sf12345@uga.edu",
        "--yes",
      ],
      deps(),
    );
    expect(err).not.toContain("failed");
    expect(process.exitCode).toBeUndefined();

    const [send] = [...bw.sends.values()];
    expect(send!.emails).toEqual(["sf12345@uga.edu", "pp11111@uga.edu"]);
    expect(send!.password).toBeNull();
    expect(send!.hideEmail).toBe(false);
    expect(send!.maxAccessCount).toBeNull();
    expect(send!.text!.text).toContain(SENTINEL);
    expect(new Date(send!.deletionDate).getTime() - NOW.getTime()).toBe(
      30 * 86_400_000,
    );

    const fields: Record<string, string | null> = Object.fromEntries(
      (bw.items.get("canva")!.fields ?? []).map((f) => [f.name ?? "", f.value]),
    );
    expect(fields).toMatchObject({
      Recipients: "sf12345@uga.edu, pp11111@uga.edu",
      "Send ID": send!.id,
      "Send link": send!.accessUrl,
      "Send account": "officer@uga.edu",
    });
    expect(copied).toEqual([send!.accessUrl]);
    expect(linearBodies[0]).toContain("Canva");
    expect(err).toContain("••••••••");

    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("extends the same Send in place on a second run, so the link stays", async () => {
    await runCreds(["send", "--item", "Canva", "--yes"], deps());
    const first = [...bw.sends.keys()];
    await runCreds(
      ["send", "--item", "Canva", "--to", "pp11111@uga.edu", "--yes"],
      deps(),
    );
    expect([...bw.sends.keys()]).toEqual(first);
    expect(bw.sends.get(first[0]!)!.emails).toEqual(["pp11111@uga.edu"]);
    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("refuses an address off the roster without --allow-email", async () => {
    await runCreds(
      ["send", "--item", "Canva", "--to", "stranger@uga.edu", "--yes"],
      deps(),
    );
    expect(process.exitCode).toBe(1);
    expect(err).toContain("Not on the officer roster: stranger@uga.edu");
    expect(bw.sends.size).toBe(0);
  });

  it("refuses to send without a terminal unless --yes", async () => {
    await runCreds(["send", "--item", "Canva"], deps());
    expect(process.exitCode).toBe(1);
    expect(err).toContain("--yes");
    expect(bw.sends.size).toBe(0);
    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("scrubs the password out of a bw failure that echoes it", async () => {
    bw.failOn = "send create";
    await runCreds(["send", "--item", "Canva", "--yes"], deps());
    expect(process.exitCode).toBe(1);
    expect(err).toContain("bw send create failed");
    expect(err).toContain("<redacted>");
    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("scrubs an unexpected error before it reaches Sentry", async () => {
    await runCreds(
      ["send", "--item", "Canva", "--yes"],
      deps({
        copy: () => {
          throw new Error(`clipboard exploded near ${SENTINEL}`);
        },
      }),
    );
    expect(process.exitCode).toBe(1);
    expect(reported).toHaveLength(1);
    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("never touches an item outside the collection", async () => {
    await runCreds(["send", "--item", "My bank", "--yes"], deps());
    expect(process.exitCode).toBe(1);
    expect(err).toContain('No shared account called "My bank"');
  });
});

describe("creds add", () => {
  it("saves an org-owned login into the collection, password from stdin, then sends it", async () => {
    await runCreds(
      [
        "add",
        "--name",
        "Linktree",
        "--url",
        "https://linktr.ee/login",
        "--username",
        "devdogsuga",
        "--owner",
        "Sloan",
        "--password-stdin",
        "--role",
        "devops",
        "--yes",
      ],
      deps(),
    );
    expect(process.exitCode).toBeUndefined();
    const created = [...bw.items.values()].find((i) => i.name === "Linktree")!;
    expect(created.organizationId).toBe("org");
    expect(created.collectionIds).toEqual(["col"]);
    expect(created.login?.password).toBe(SENTINEL);
    expect([...bw.sends.values()][0]!.emails).toEqual(["sf12345@uga.edu"]);
    expect(everywhere()).not.toContain(SENTINEL);
  });
});

describe("creds renew", () => {
  it("asks before renewing a Send with more than 7 days left, and --yes answers", async () => {
    await runCreds(["send", "--item", "Canva", "--yes"], deps());
    out = err = "";

    await runCreds(["renew"], deps());
    expect(process.exitCode).toBe(1);
    expect(err).toContain("More than 7 days left on: Canva (30 days left)");

    process.exitCode = undefined;
    const later = new Date(NOW.getTime() + 25 * 86_400_000);
    await runCreds(["renew"], deps({ now: () => later }));
    expect(process.exitCode).toBeUndefined();
    const [send] = [...bw.sends.values()];
    expect(new Date(send!.deletionDate).getTime() - later.getTime()).toBe(
      30 * 86_400_000,
    );
    expect(everywhere()).not.toContain(SENTINEL);
  });

  it("makes a new Send when the recorded one belongs to someone else", async () => {
    const canva = bw.items.get("canva")!;
    canva.fields!.push(
      { name: "Send ID", value: "someone-elses", type: 0 },
      { name: "Send expires", value: "2026-10-07T00:00:00.000Z", type: 0 },
      { name: "Send account", value: "other@uga.edu", type: 0 },
    );
    await runCreds(["renew"], deps());
    expect(process.exitCode).toBeUndefined();
    expect(err).toContain("belongs to other@uga.edu");
    expect(bw.sends.size).toBe(1);
    expect(everywhere()).not.toContain(SENTINEL);
  });
});

describe("creds list", () => {
  it("prints accounts, recipients and expiry, and no secrets", async () => {
    await runCreds(["list", "--json"], deps());
    const rows = JSON.parse(out) as { name: string; status: string }[];
    expect(rows).toEqual([
      expect.objectContaining({ name: "Canva", status: "No Send" }),
    ]);
    expect(everywhere()).not.toContain(SENTINEL);
    expect(everywhere()).not.toContain("not-shared");
  });
});
