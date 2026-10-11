import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENVIRONMENTS,
  ERROR_SAMPLE_RATE,
  SERVICES,
  tracesSampleRateFor,
} from "../../sdk/src/telemetry/constants.js";
import { buildOutputs, findDrift } from "./generate.js";

const SPEC = join(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("the drift check", () => {
  it("finds every generated file in sync with its spec", () => {
    const outputs = buildOutputs();
    expect(outputs.length).toBeGreaterThan(15);
    // On failure the message names the files: run `pnpm -F @devdogsuga/sdk-spec codegen`.
    expect(findDrift(outputs)).toEqual({ changed: [], stale: [], copies: [] });
  });

  it("is deterministic: two builds are byte-identical", () => {
    const first = buildOutputs();
    const second = buildOutputs();
    expect(second.map((o) => o.path)).toEqual(first.map((o) => o.path));
    for (const [i, output] of first.entries()) {
      expect(
        Buffer.from(second[i]!.content).equals(Buffer.from(output.content)),
      ).toBe(true);
    }
  });

  it("detects an edit to a generated file", () => {
    const outputs = buildOutputs();
    const tampered = outputs.map((o, i) =>
      i === 0 ? { ...o, content: `${String(o.content)}\n// edited` } : o,
    );
    expect(findDrift(tampered).changed).toHaveLength(1);
  });
});

describe("constants.json", () => {
  const constants = JSON.parse(
    readFileSync(join(SPEC, "constants.json"), "utf8"),
  ) as {
    telemetry: {
      services: string[];
      environments: string[];
      tracesSampleRates: Record<string, number>;
      errorSampleRate: number;
    };
    oauth: { tiers: string[]; scopes: string[] };
  };

  it("agrees with @devdogsuga/sdk/telemetry", () => {
    expect(constants.telemetry.services).toEqual([...SERVICES]);
    expect(constants.telemetry.environments).toEqual([...ENVIRONMENTS]);
    expect(constants.telemetry.errorSampleRate).toBe(ERROR_SAMPLE_RATE);
    for (const environment of ENVIRONMENTS) {
      expect(tracesSampleRateFor(environment)).toBe(
        constants.telemetry.tracesSampleRates[environment] ?? 0,
      );
    }
  });

  it("lists the OAuth tiers the platform enforces", () => {
    expect(constants.oauth.tiers).toEqual(["development", "production"]);
    expect(constants.oauth.scopes).toEqual(["openid", "email", "profile"]);
  });
});
