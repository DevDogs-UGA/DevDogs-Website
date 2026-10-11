/**
 * `@devdogsuga/sdk/platform`: the generated client and types for the
 * platform's public API (`/moderation/v1`).
 *
 * Reports need a signature, so filing one is `createModerationClient` in
 * `@devdogsuga/sdk/moderation`; this module carries the unsigned calls and the
 * shared types.
 *
 * Everything but this file is generated from
 * `packages/sdk-spec/openapi/platform.yaml`.
 */
export * from "./generated.js";
export {
  ApiError,
  type ClientConfig,
  type RequestOptions,
} from "../client/http.js";
