/**
 * `curl devdogsuga.org/<path>` gets a terminal page instead of HTML.
 *
 * Decided here, at the edge, rather than in middleware. vinext's page cache
 * keys on the URL, so a middleware rewrite that answered curl and browsers
 * differently at the same URL could leave one client's response in the other's
 * cache entry. Forwarding to a different URL (`/terminal/<path>`) before vinext
 * runs keeps the two apart, and the forwarded request still goes through
 * vinext, so the terminal routes get the same request context, loaders and
 * middleware as every page. The idea is borrowed from ysap.sh
 * (github.com/bahamas10/ysap), which does the same for curl in nginx.
 *
 * Terminal twins are opt-in (`~/terminal/paths`). A path without one is asked
 * of the app as usual:
 *
 *   - a page (an HTML 200) is answered with a generic notice: its `<title>`,
 *     its URL and "open this in a browser", rather than a screenful of markup;
 *   - an HTML 404 is answered with the terminal's own 404, so a mistyped path
 *     doesn't print markup either;
 *   - anything else (an API route, `/events/calendar.ics`, a redirect) passes
 *     through untouched.
 */
import {
  matchTerminalPath,
  TERMINAL_PREFIX,
  terminalFormat,
  type TerminalFormat,
} from "~/terminal/paths";

function forward(request: Request, format: TerminalFormat): Request {
  const url = new URL(request.url);
  url.pathname = `${TERMINAL_PREFIX}${url.pathname === "/" ? "" : url.pathname}`;
  url.searchParams.set("format", format === "plain" ? "txt" : "ansi");
  return new Request(url, { method: request.method, headers: request.headers });
}

/** How much of the page to read while looking for its `<title>`. */
const TITLE_SCAN_BYTES = 32_768;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * The page's `<title>`, read from the first chunk of its HTML. Control
 * characters are stripped, because the text is printed to a terminal: an
 * escape sequence smuggled into a title must not reach one.
 */
async function pageTitle(response: Response): Promise<string> {
  if (!response.body) return "DevDogs";
  const reader =
    response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (bytes < TITLE_SCAN_BYTES && !/<\/title>/i.test(html)) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const title = raw
    .replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ENTITIES[entity]!)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return title || "DevDogs";
}

/**
 * What curl gets for a page that has no terminal twin: the page's title, its
 * URL and a pointer to the browser. Built here, from the HTML the app already
 * produced, so shipping a page needs no terminal work.
 */
async function genericPage(
  request: Request,
  response: Response,
  format: TerminalFormat,
): Promise<Response> {
  const url = new URL(request.url);
  const title = await pageTitle(response);
  const heading = format === "ansi" ? `\u001b[1m${title}\u001b[0m` : title;
  const body = [
    heading,
    "",
    "This page is built for a browser. Open it there:",
    `${url.origin}${url.pathname}`,
    "",
  ].join("\n");
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
      // The page may differ per viewer (cookies), so never share this.
      "cache-control": "private, no-store",
    },
  });
}

/**
 * The response for a terminal client, or null to let the request through
 * as-is.
 */
export async function serveTerminal(
  request: Request,
  app: (request: Request) => Promise<Response>,
): Promise<Response | null> {
  const format = terminalFormat(request);
  if (!format) return null;
  const { pathname } = new URL(request.url);
  if (
    pathname === TERMINAL_PREFIX ||
    pathname.startsWith(`${TERMINAL_PREFIX}/`)
  ) {
    return null;
  }
  if (matchTerminalPath(pathname)) return app(forward(request, format));

  const response = await app(request);
  const html = (response.headers.get("content-type") ?? "").includes(
    "text/html",
  );
  if (!html) return response;
  if (response.status === 404) {
    await response.body?.cancel();
    return app(forward(request, format));
  }
  if (response.status === 200) return genericPage(request, response, format);
  return response;
}
