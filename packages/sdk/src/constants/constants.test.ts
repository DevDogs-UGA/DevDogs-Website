import { describe, expect, it } from "vitest";
import { CLIENT_ID_HEADER, SECRET_PREFIX } from "../moderation/index.js";
import {
  ENVIRONMENTS as TELEMETRY_ENVIRONMENTS,
  SERVICES as TELEMETRY_SERVICES,
} from "../telemetry/index.js";
import { CLIENT, HOSTS, MODERATION, OAUTH, PATHS, TELEMETRY } from "./index.js";

/** The generated constants and the hand-written modules they mirror must agree. */
describe("generated constants", () => {
  it("match the moderation module", () => {
    expect(MODERATION.clientIdHeader).toBe(CLIENT_ID_HEADER);
    expect(MODERATION.secretPrefix).toBe(SECRET_PREFIX);
  });

  it("match telemetry", () => {
    expect(TELEMETRY.services).toEqual([...TELEMETRY_SERVICES]);
    expect(TELEMETRY.environments).toEqual([...TELEMETRY_ENVIRONMENTS]);
  });

  it("name the hosts and paths both SDKs use", () => {
    expect(HOSTS.api.production).toBe("https://api.devdogsuga.org");
    expect(HOSTS.api.staging).toBe("https://api-staging.devdogsuga.org");
    expect(PATHS.catalog).toBe("/catalog/v1");
    expect(PATHS.moderation).toBe("/moderation/v1");
    expect(CLIENT.header).toBe("X-Client");
  });

  it("name the OAuth provider and its tiers", () => {
    expect(OAUTH.providerId).toBe("custom:devdogsuga");
    expect(OAUTH.tiers).toEqual(["development", "production"]);
  });
});
