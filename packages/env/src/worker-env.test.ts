import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { declare, define, resetRegistry } from "./define.js";
import { buildWorkerEnv } from "./worker-env.js";

const doc = "test";

beforeEach(() => {
  resetRegistry();
  declare({
    source: "web",
    server: {
      SECRET: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "secret",
      }),
      NEVER: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "never-store",
      }),
      PUBLIC_URL: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "public",
      }),
      OPTIONAL: define(z.string().optional(), {
        doc,
        scope: "environment",
        secrecy: "secret",
      }),
      DEPLOY_ENV: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "public",
      }),
    },
    client: {
      NEXT_PUBLIC_X: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "public",
      }),
    },
  });
  declare({
    source: "web:tooling",
    server: {
      TOOLING_ONLY: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
  declare({
    source: "other",
    server: {
      OTHER_KEY: define(z.string(), {
        doc,
        scope: "environment",
        secrecy: "secret",
      }),
    },
  });
});

const environment = {
  SECRET: "s",
  NEVER: "n",
  PUBLIC_URL: "u",
  DEPLOY_ENV: "staging",
  NEXT_PUBLIC_X: "x",
  TOOLING_ONLY: "t",
  OTHER_KEY: "o",
  OPTIONAL: "",
};

describe("buildWorkerEnv", () => {
  it("deploy: sends the app's storable and public server keys only", () => {
    const { env, absent, minted } = buildWorkerEnv(
      "web",
      environment,
      "deploy",
    );
    expect(env).toEqual({
      SECRET: "s",
      PUBLIC_URL: "u",
      DEPLOY_ENV: "staging",
    });
    expect(absent).toEqual(["OPTIONAL"]);
    expect(minted).toEqual([]);
  });

  it("deploy: reports minted secrets instead of filling them", () => {
    declare({
      source: "minty",
      server: {
        MINTED: define(z.string(), {
          doc,
          scope: "environment",
          secrecy: "secret",
          minted: true,
        }),
      },
    });
    expect(buildWorkerEnv("minty", { MINTED: "v" }, "deploy").minted).toEqual([
      "MINTED",
    ]);
  });

  it("dev: scopes to the app, keeps client keys, drops wrangler-owned keys", () => {
    const { env } = buildWorkerEnv("web", environment, "dev");
    expect(Object.keys(env)).toEqual([
      "NEVER",
      "NEXT_PUBLIC_X",
      "OPTIONAL",
      "PUBLIC_URL",
      "SECRET",
    ]);
    expect(env.OPTIONAL).toBe("");
  });
});
