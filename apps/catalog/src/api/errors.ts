/** Every `error.code` the API sends; openapi/catalog.yaml lists the same set (a test compares them). */
export const ERROR_CODES = [
  "invalid_parameter",
  "missing_parameter",
  "too_many_courses",
  "not_found",
  "rate_limited",
  "method_not_allowed",
  "unavailable",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** An error with the HTTP status and code a client sees. Anything else thrown becomes a 500. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const invalid = (message: string) =>
  new ApiError(400, "invalid_parameter", message);
export const missing = (name: string) =>
  new ApiError(400, "missing_parameter", `Missing required parameter: ${name}.`);
export const notFound = (message: string) =>
  new ApiError(404, "not_found", message);
