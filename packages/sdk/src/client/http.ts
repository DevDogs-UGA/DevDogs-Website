/**
 * The HTTP runtime the generated clients (`../catalog`, `../platform`) call.
 *
 * `fetch` only, so it runs in a browser, a Worker, Deno and Node alike. One
 * error type for every failure the API answers with: the generated clients
 * never invent their own.
 */

export interface ClientConfig {
  /**
   * The API's origin plus its base path, for example
   * `https://api.devdogsuga.org/catalog/v1`. Required on purpose: read it from
   * the environment so staging and production are the same code.
   */
  baseUrl: string;
  /** A `fetch` to use instead of the global one (tests, retries, tracing). */
  fetch?: typeof fetch;
  /**
   * Who is calling, for example `dogdays/1.4`: sent as `X-Client`, for usage
   * numbers only. It changes no response.
   */
  client?: string;
  /** Extra headers on every request. */
  headers?: Readonly<Record<string, string>>;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface RequestSpec {
  method: string;
  /** Starts with `/`; appended to `baseUrl`. */
  path: string;
  /** Undefined values are left out. */
  query?: Readonly<Record<string, string | number | boolean | undefined>>;
  body?: unknown;
}

/** The body the API's errors share: `{ error: { code, message } }`. */
interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

/** The API refused the request or could not answer it. */
export class ApiError extends Error {
  readonly status: number;
  /** The API's `error.code`, or null when the body was not an API error. */
  readonly code: string | null;
  /** Seconds from `Retry-After`, set on a 429 or 503. */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string | null,
    message: string,
    retryAfterSeconds: number | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function buildUrl(config: ClientConfig, spec: RequestSpec): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.size > 0 ? `?${search.toString()}` : "";
  return `${base}${spec.path}${query}`;
}

export async function request<T>(
  config: ClientConfig,
  spec: RequestSpec,
  options?: RequestOptions,
): Promise<T> {
  const doFetch = config.fetch ?? fetch;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...config.headers,
  };
  if (config.client) headers["x-client"] = config.client;
  if (spec.body !== undefined) headers["content-type"] = "application/json";

  const response = await doFetch(buildUrl(config, spec), {
    method: spec.method,
    headers,
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
    signal: options?.signal,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as ErrorBody;
    const code =
      typeof body.error?.code === "string" ? body.error.code : null;
    const message =
      typeof body.error?.message === "string"
        ? body.error.message
        : `The API answered ${response.status}`;
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new ApiError(
      response.status,
      code,
      message,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    );
  }

  return parsed as T;
}
