import { describe, expect, it } from "vitest";
import {
  computeActionPatterns,
  externalActionUses,
  isShaPinned,
  parseUsesLines,
  unpinnedActionUses,
  type ActionUse,
} from "./workflows.js";

const FIXTURE = `
name: CI
on: push
jobs:
  build:
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: ./.github/actions/setup-workspace
      - name: pin comment with hash in string
        uses: "getsentry/action-release@ff07929a6537bac57790c3451cf4d364aca38528" # v3.7.0
      - uses: subosito/flutter-action@v2
  reuse:
    uses: ./.github/workflows/deploy-app.yaml
`;

describe("parseUsesLines", () => {
  it("finds every uses: line, local and external alike", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    expect(uses).toHaveLength(5);
  });

  it("strips a trailing # comment and surrounding quotes", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    const sentry = uses.find((u) => u.ref?.repo === "action-release")!;
    expect(sentry.raw).toBe(
      "getsentry/action-release@ff07929a6537bac57790c3451cf4d364aca38528",
    );
  });

  it("classifies a local path (./…) with ref: null", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    const local = uses.find((u) => u.raw === "./.github/actions/setup-workspace")!;
    expect(local.ref).toBeNull();
  });

  it("classifies a same-repo reusable workflow (./…yaml) with ref: null", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    const reusable = uses.find((u) => u.raw === "./.github/workflows/deploy-app.yaml")!;
    expect(reusable.ref).toBeNull();
  });

  it("splits owner/repo@version for an external action", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    const checkout = uses.find((u) => u.raw.startsWith("actions/checkout@"))!;
    expect(checkout.ref).toEqual({
      owner: "actions",
      repo: "checkout",
      version: "11d5960a326750d5838078e36cf38b85af677262",
    });
  });

  it("records line numbers (1-indexed)", () => {
    const uses = parseUsesLines("ci.yaml", FIXTURE);
    const checkout = uses.find((u) => u.raw.startsWith("actions/checkout@"))!;
    expect(checkout.line).toBe(7);
  });

  it("ignores blank and non-uses: lines", () => {
    const uses = parseUsesLines("ci.yaml", "name: CI\non: push\n");
    expect(uses).toHaveLength(0);
  });
});

describe("isShaPinned / unpinnedActionUses", () => {
  const uses = parseUsesLines("ci.yaml", FIXTURE);

  it("treats a 40-hex SHA ref as pinned", () => {
    const checkout = uses.find((u) => u.raw.startsWith("actions/checkout@"))!;
    expect(isShaPinned(checkout)).toBe(true);
  });

  it("treats a local path (ref: null) as pinned — nothing to pin", () => {
    const local = uses.find((u) => u.ref === null)!;
    expect(isShaPinned(local)).toBe(true);
  });

  it("treats a version tag (v2) as NOT pinned", () => {
    const flutter = uses.find((u) => u.raw.startsWith("subosito/flutter-action@"))!;
    expect(isShaPinned(flutter)).toBe(false);
  });

  it("unpinnedActionUses lists only the unpinned external action, excluding local paths", () => {
    const unpinned = unpinnedActionUses(uses);
    expect(unpinned.map((u) => u.raw)).toEqual(["subosito/flutter-action@v2"]);
  });

  it("a fully-pinned workflow set has no unpinned actions", () => {
    const pinnedOnly = uses.filter((u) => u.raw !== "subosito/flutter-action@v2");
    expect(unpinnedActionUses(pinnedOnly)).toEqual([]);
  });
});

describe("externalActionUses / computeActionPatterns", () => {
  const uses = parseUsesLines("ci.yaml", FIXTURE);

  it("excludes local paths from the external list", () => {
    const external = externalActionUses(uses);
    expect(external.every((u) => u.ref !== null)).toBe(true);
    expect(external).toHaveLength(3);
  });

  it("computes owner/repo@* patterns, deduplicated and sorted", () => {
    const withDuplicate: ActionUse[] = [
      ...uses,
      {
        raw: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        ref: {
          owner: "actions",
          repo: "checkout",
          version: "11d5960a326750d5838078e36cf38b85af677262",
        },
        file: "other.yaml",
        line: 1,
      },
    ];
    expect(computeActionPatterns(withDuplicate)).toEqual([
      "actions/checkout@*",
      "getsentry/action-release@*",
      "subosito/flutter-action@*",
    ]);
  });
});
