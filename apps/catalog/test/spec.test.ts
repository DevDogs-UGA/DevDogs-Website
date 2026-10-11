import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "~/api/errors";
import {
  BROWSER_CACHE_SECONDS,
  EDGE_CACHE_SECONDS,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_PERIOD_SECONDS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_RATE_LIMIT_PER_MINUTE,
  SECTIONS_MAX_COURSES,
} from "~/api/limits";
import { API_PREFIX, ROUTES } from "~/api/router";
import {
  PROGRAMS_SCHEDULE,
  SCRAPE_SCHEDULE,
  WORKFLOW_CRONS,
} from "../cloudflare/scheduled";
import {
  loadSpec,
  refsIn,
  resolveRef,
  responseValidator,
  routerPattern,
} from "./spec";
import { loadWrangler, tiersOf, type WranglerTier } from "./wrangler";

/**
 * The spec, the router, the limits and the Worker configuration say the same
 * thing. openapi/catalog.yaml is the contract; each of these tests fails when
 * something else drifts from it.
 */

const spec = loadSpec();

type Param = {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
  $ref?: string;
};

function parametersOf(path: string): Param[] {
  const operation = spec.paths[path]!.get!;
  return (operation.parameters ?? []).map((p) => {
    const param = p as Param;
    return param.$ref ? (resolveRef(spec, param.$ref) as Param) : param;
  });
}

describe("the paths", () => {
  it("are the router's routes, no more and no fewer", () => {
    expect(Object.keys(spec.paths).map(routerPattern).sort()).toEqual(
      ROUTES.map((r) => r.pattern).sort(),
    );
  });

  it("are GET only, with a unique operationId each", () => {
    const ids = Object.entries(spec.paths).map(([path, methods]) => {
      expect(Object.keys(methods), path).toEqual(["get"]);
      return methods.get!.operationId;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("have the servers the Worker routes serve", () => {
    const hosts = tiersOf(loadWrangler())
      .flatMap(([, tier]) => tier.routes ?? [])
      .map((route) => route.pattern.replace(/\/catalog\/v1\/\*$/, ""));
    expect(spec.servers.map((s) => s.url)).toEqual(
      hosts.map((host) => `https://${host}${API_PREFIX}`).reverse(),
    );
  });

  it("all accept the optional X-Client header", () => {
    for (const path of Object.keys(spec.paths)) {
      expect(
        parametersOf(path).some(
          (p) => p.name === "X-Client" && p.in === "header" && !p.required,
        ),
        path,
      ).toBe(true);
    }
  });
});

describe("every $ref", () => {
  it("resolves", () => {
    const refs = refsIn(spec);
    expect(refs.length).toBeGreaterThan(20);
    for (const ref of refs) expect(resolveRef(spec, ref), ref).toBeDefined();
  });
});

describe("the caps and limits", () => {
  const search = () => parametersOf("/search");

  it("/search takes at most the limit the code enforces", () => {
    const limit = search().find((p) => p.name === "limit")!;
    expect(limit.schema).toMatchObject({
      minimum: 1,
      maximum: SEARCH_MAX_LIMIT,
      default: SEARCH_DEFAULT_LIMIT,
    });
    const results = (
      spec.components.schemas.SearchResults as {
        properties: { results: unknown; limit: unknown };
      }
    ).properties;
    expect(results.results).toMatchObject({ maxItems: SEARCH_MAX_LIMIT });
    expect(results.limit).toMatchObject({ maximum: SEARCH_MAX_LIMIT });
  });

  it("/search limits the query to the length the code enforces", () => {
    const q = search().find((p) => p.name === "q")!;
    expect(q.required).toBe(true);
    expect(q.schema).toMatchObject({
      minLength: 1,
      maxLength: SEARCH_QUERY_MAX_LENGTH,
    });
  });

  it("the description states every number", () => {
    const text = spec.info.description.replace(/\s+/g, " ");
    expect(text).toContain(`${RATE_LIMIT_PER_MINUTE} requests a minute`);
    expect(text).toContain(
      `${SEARCH_RATE_LIMIT_PER_MINUTE} a minute on \`/search\``,
    );
    expect(text).toContain(`at most ${SEARCH_MAX_LIMIT} results`);
    expect(text).toContain(`takes at most ${SECTIONS_MAX_COURSES} courses`);
  });

  it("/sections says its cap in its own description", () => {
    const operation = spec.paths["/sections"]!.get as unknown as {
      description: string;
    };
    expect(operation.description).toContain(`exceed ${SECTIONS_MAX_COURSES}`);
  });

  it("every operation documents a 429 and a 503, and the 400s it can return", () => {
    for (const [path, methods] of Object.entries(spec.paths)) {
      const codes = Object.keys(methods.get!.responses);
      expect(codes, path).toEqual(
        expect.arrayContaining(["200", "429", "503"]),
      );
    }
    for (const path of [
      "/search",
      "/sections",
      "/subjects/{abbr}/courses",
      "/courses/{abbr}",
      "/course-exists",
      "/subjects",
    ]) {
      expect(Object.keys(spec.paths[path]!.get!.responses), path).toContain(
        "400",
      );
    }
  });

  it("the error codes are the ones the API sends", () => {
    const error = spec.components.schemas.Error as {
      properties: { error: { properties: { code: { enum: string[] } } } };
    };
    expect([...error.properties.error.properties.code.enum].sort()).toEqual(
      [...ERROR_CODES].sort(),
    );
  });

  it("the cache lifetimes are sane", () => {
    expect(BROWSER_CACHE_SECONDS).toBeLessThanOrEqual(EDGE_CACHE_SECONDS);
    expect(EDGE_CACHE_SECONDS).toBeLessThanOrEqual(600);
  });
});

describe("wrangler.jsonc", () => {
  const config = loadWrangler();

  it("binds the rate limits at the numbers in limits.ts, with a window of one minute", () => {
    expect(RATE_LIMIT_PERIOD_SECONDS).toBe(60);
    for (const [name, tier] of tiersOf(config)) {
      const limits = Object.fromEntries(
        (tier.ratelimits ?? []).map((r) => [r.name, r]),
      );
      expect(limits.CATALOG_LIMITER?.simple, name).toEqual({
        limit: RATE_LIMIT_PER_MINUTE,
        period: RATE_LIMIT_PERIOD_SECONDS,
      });
      expect(limits.SEARCH_LIMITER?.simple, name).toEqual({
        limit: SEARCH_RATE_LIMIT_PER_MINUTE,
        period: RATE_LIMIT_PERIOD_SECONDS,
      });
    }
  });

  it("gives every environment its own rate-limit namespaces", () => {
    const ids = tiersOf(config).flatMap(([, tier]) =>
      (tier.ratelimits ?? []).map((r) => r.namespace_id),
    );
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("names its Workers ${DEPLOY_ENV}-catalog", () => {
    expect(config.name).toBe("development-catalog");
    expect(config.env.staging.name).toBe("staging-catalog");
    expect(config.env.production.name).toBe("production-catalog");
  });

  it("routes only the catalog's path on the API host", () => {
    expect(config.env.staging.routes).toEqual([
      {
        pattern: "api-staging.devdogsuga.org/catalog/v1/*",
        zone_name: "devdogsuga.org",
      },
    ]);
    expect(config.env.production.routes).toEqual([
      {
        pattern: "api.devdogsuga.org/catalog/v1/*",
        zone_name: "devdogsuga.org",
      },
    ]);
    expect(config.routes).toBeUndefined();
  });

  it("schedules the scrape and the program sync in production only", () => {
    const schedulesOf = (tier: WranglerTier) =>
      Object.fromEntries(
        (tier.workflows ?? []).map((w) => [w.binding, w.schedules ?? []]),
      );
    expect(schedulesOf(config.env.production)).toEqual({
      SCRAPE_WORKFLOW: [SCRAPE_SCHEDULE],
      PROGRAMS_WORKFLOW: [PROGRAMS_SCHEDULE],
    });
    expect(schedulesOf(config.env.staging)).toEqual({
      SCRAPE_WORKFLOW: [],
      PROGRAMS_WORKFLOW: [],
    });
    expect(schedulesOf(config)).toEqual({
      SCRAPE_WORKFLOW: [],
      PROGRAMS_WORKFLOW: [],
    });
  });

  it("scheduled.ts (what devtools audits) labels exactly those schedules", () => {
    expect(
      Object.entries(WORKFLOW_CRONS).map(([cron, { binding }]) => [
        cron,
        binding,
      ]),
    ).toEqual([
      [SCRAPE_SCHEDULE, "SCRAPE_WORKFLOW"],
      [PROGRAMS_SCHEDULE, "PROGRAMS_WORKFLOW"],
    ]);
  });
});

describe("the response validator", () => {
  const validator = responseValidator(spec);

  it("accepts a conforming body and rejects one that drifts", () => {
    const term = {
      academicPeriod: 202702,
      description: "Spring 2027",
      classesBegin: "2027-01-11",
      classesEnd: "2027-05-04",
      dropAddEnds: "2027-01-15",
      partsOfTerm: [],
    };
    expect(validator.check("listTerms", 200, { terms: [term] })).toEqual([]);
    expect(
      validator.check("listTerms", 200, { terms: [{ ...term, extra: 1 }] }),
    ).not.toEqual([]);
    expect(
      validator.check("listTerms", 200, {
        terms: [{ ...term, academicPeriod: "202702" }],
      }),
    ).not.toEqual([]);
    expect(
      validator.check("listTerms", 200, {
        terms: [{ ...term, dropAddEnds: "1/15/2027" }],
      }),
    ).not.toEqual([]);
    expect(
      validator.check("searchCourses", 400, {
        error: { code: "made_up", message: "x" },
      }),
    ).not.toEqual([]);
  });
});
