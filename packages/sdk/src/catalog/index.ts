/**
 * `@devdogsuga/sdk/catalog`: the generated client for the public, read-only
 * UGA course catalog API (`/catalog/v1`), and its types.
 *
 * ```ts
 * const catalog = createCatalogClient({
 *   baseUrl: `${process.env.CATALOG_URL}`, // https://api.devdogsuga.org/catalog/v1
 *   client: "dogdays/1.0",
 * });
 * const { terms } = await catalog.listTerms();
 * ```
 *
 * Everything but this file is generated from
 * `packages/sdk-spec/openapi/catalog.yaml`.
 */
export * from "./generated.js";
export {
  ApiError,
  type ClientConfig,
  type RequestOptions,
} from "../client/http.js";
