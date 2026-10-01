import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `commands.ts` orchestrates a workflow scan plus a dozen `gh` calls; both
 * are mocked here so this suite is about ORCHESTRATION — dry-run vs
 * --apply, the unpinned-action refusal reaching the CLI, and which api.js
 * writers fire for which drift — not about `gh` itself (`api.test.ts`) or
 * the pure diff shape (`diff.test.ts`, `desired.test.ts`).
 */
function baseRepoFixture() {
  return {
    private: false,
    security_and_analysis: {
      secret_scanning: { status: "enabled" as const },
      secret_scanning_push_protection: { status: "enabled" as const },
      secret_scanning_non_provider_patterns: { status: "enabled" as const },
      secret_scanning_validity_checks: { status: "enabled" as const },
    },
  };
}

function baseEnvironment(name: string, requireReviewers: boolean) {
  return {
    environment: {
      name,
      protection_rules: requireReviewers
        ? [{ type: "required_reviewers", reviewers: [{ type: "Team" }] }]
        : [],
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
    },
    branchPolicies: [
      { id: 1, name: name === "staging" ? "main" : "production" },
    ],
  };
}

const api = vi.hoisted(() => ({
  getRepo: vi.fn(async () => baseRepoFixture()),
  getVulnerabilityAlertsEnabled: vi.fn(async () => true),
  getAutomatedSecurityFixes: vi.fn(async () => ({ enabled: true })),
  getActionsPermissions: vi.fn(async () => ({
    enabled: true,
    allowed_actions: "selected" as const,
    sha_pinning_required: true,
  })),
  getSelectedActions: vi.fn(async () => ({
    github_owned_allowed: true,
    verified_allowed: true,
    patterns_allowed: ["actions/checkout@*"],
  })),
  getWorkflowPermissions: vi.fn(async () => ({
    default_workflow_permissions: "read" as const,
    can_approve_pull_request_reviews: false,
  })),
  getEnvironment: vi.fn(
    async (_r: unknown, name: string) =>
      baseEnvironment(name, name === "production-apply").environment,
  ),
  getDeploymentBranchPolicies: vi.fn(
    async (_r: unknown, name: string) =>
      baseEnvironment(name, false).branchPolicies,
  ),
  patchSecurityAndAnalysis: vi.fn(async () => undefined),
  setVulnerabilityAlertsEnabled: vi.fn(async () => undefined),
  setAutomatedSecurityFixesEnabled: vi.fn(async () => undefined),
  setActionsPermissions: vi.fn(async () => undefined),
  setSelectedActions: vi.fn(async () => undefined),
  setWorkflowPermissions: vi.fn(async () => undefined),
  setDeploymentBranchPolicyMode: vi.fn(async () => undefined),
  addDeploymentBranchPolicy: vi.fn(async () => undefined),
  deleteDeploymentBranchPolicy: vi.fn(async () => undefined),
}));

vi.mock("./api.js", () => api);

const workflowsMock = vi.hoisted(() => ({
  uses: [] as {
    raw: string;
    ref: { owner: string; repo: string; version: string } | null;
    file: string;
    line: number;
  }[],
}));

vi.mock("./workflows.js", () => ({
  collectActionUses: vi.fn(() => workflowsMock.uses),
  computeActionPatterns: vi.fn((uses: typeof workflowsMock.uses) =>
    [
      ...new Set(
        uses
          .filter((u) => u.ref)
          .map((u) => `${u.ref!.owner}/${u.ref!.repo}@*`),
      ),
    ].sort(),
  ),
  unpinnedActionUses: vi.fn((uses: typeof workflowsMock.uses) =>
    uses.filter((u) => u.ref && !/^[0-9a-f]{40}$/.test(u.ref.version)),
  ),
}));

import { runGithubSettings } from "./commands.js";

function captureConsole() {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return {
    log,
    err,
    restore: () => {
      log.mockRestore();
      err.mockRestore();
    },
  };
}

beforeEach(() => {
  workflowsMock.uses = [
    {
      raw: "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
      ref: {
        owner: "actions",
        repo: "checkout",
        version: "11d5960a326750d5838078e36cf38b85af677262",
      },
      file: "ci.yaml",
      line: 1,
    },
  ];
  for (const fn of Object.values(api)) fn.mockClear();
});

describe("dry run (no --apply)", () => {
  it("reports a matching live snapshot as no drift and applies nothing", async () => {
    const { log, err, restore } = captureConsole();
    const code = await runGithubSettings(["--json"]);
    expect(code).toBe(0);
    expect(err).not.toHaveBeenCalled();
    const plan = JSON.parse(log.mock.calls[0]![0] as string) as {
      checks: { status: string }[];
    };
    expect(plan.checks.every((c) => c.status === "ok")).toBe(true);
    expect(api.patchSecurityAndAnalysis).not.toHaveBeenCalled();
    restore();
  });

  it("never writes anything without --apply, even when drift is present", async () => {
    api.getVulnerabilityAlertsEnabled.mockResolvedValueOnce(false);
    const { restore } = captureConsole();
    const code = await runGithubSettings(["--json"]);
    expect(code).toBe(0);
    expect(api.setVulnerabilityAlertsEnabled).not.toHaveBeenCalled();
    restore();
  });
});

describe("unpinned-action refusal", () => {
  it("refuses sha_pinning_required and lists the unpinned uses: in the rendered plan", async () => {
    workflowsMock.uses = [
      {
        raw: "subosito/flutter-action@v2",
        ref: { owner: "subosito", repo: "flutter-action", version: "v2" },
        file: ".github/workflows/ci.yaml",
        line: 42,
      },
    ];
    const { log, restore } = captureConsole();
    const code = await runGithubSettings([]);
    expect(code).toBe(0);
    const printed = log.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain("REFUSED");
    expect(printed).toContain(".github/workflows/ci.yaml:42");
    restore();
  });

  it("never sets sha_pinning_required via --apply when an action is unpinned", async () => {
    workflowsMock.uses = [
      {
        raw: "subosito/flutter-action@v2",
        ref: { owner: "subosito", repo: "flutter-action", version: "v2" },
        file: ".github/workflows/ci.yaml",
        line: 42,
      },
    ];
    api.getActionsPermissions.mockResolvedValueOnce({
      enabled: true,
      allowed_actions: "all",
      sha_pinning_required: false,
    });
    const { restore } = captureConsole();
    const code = await runGithubSettings(["--apply", "--yes"]);
    expect(code).toBe(0);
    expect(api.setActionsPermissions).toHaveBeenCalledTimes(1);
    const body = api.setActionsPermissions.mock.calls[0]![1] as {
      sha_pinning_required?: boolean;
    };
    expect(body.sha_pinning_required).toBe(false);
    restore();
  });
});

describe("--apply", () => {
  it("writes only drifted, fixable checks, and reports Applied", async () => {
    api.getVulnerabilityAlertsEnabled.mockResolvedValueOnce(false);
    const { log, restore } = captureConsole();
    const code = await runGithubSettings(["--apply", "--yes"]);
    expect(code).toBe(0);
    expect(api.setVulnerabilityAlertsEnabled).toHaveBeenCalledWith(
      expect.anything(),
      true,
    );
    expect(api.patchSecurityAndAnalysis).not.toHaveBeenCalled();
    expect(log.mock.calls.at(-1)![0]).toBe("Applied.");
    restore();
  });

  it("never auto-fixes a missing required reviewer on production-apply", async () => {
    api.getEnvironment.mockImplementation(
      async (_r: unknown, name: string) =>
        baseEnvironment(name, false).environment,
    );
    const { restore } = captureConsole();
    const code = await runGithubSettings(["--apply", "--yes", "--json"]);
    expect(code).toBe(0);
    // No environment write call ever receives reviewer data — this
    // reconciler has no function that could even express one.
    expect(api.setDeploymentBranchPolicyMode).not.toHaveBeenCalled();
    restore();
  });

  it("refuses to apply with no confirmation and no TTY, without --yes", async () => {
    api.getVulnerabilityAlertsEnabled.mockResolvedValueOnce(false);
    const ttyDescriptor = Object.getOwnPropertyDescriptor(
      process.stdin,
      "isTTY",
    );
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    const { err, restore } = captureConsole();
    const code = await runGithubSettings(["--apply"]);
    expect(code).toBe(1);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("--yes is required"),
    );
    expect(api.setVulnerabilityAlertsEnabled).not.toHaveBeenCalled();
    restore();
    if (ttyDescriptor)
      Object.defineProperty(process.stdin, "isTTY", ttyDescriptor);
  });
});

describe("read failures", () => {
  it("reports a failed read and exits nonzero without applying", async () => {
    api.getRepo.mockRejectedValueOnce(new Error("HTTP 403 Forbidden"));
    const { err, restore } = captureConsole();
    const code = await runGithubSettings([]);
    expect(code).toBe(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("403"));
    restore();
  });
});
