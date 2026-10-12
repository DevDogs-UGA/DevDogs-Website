/**
 * Where a client wants its decisions delivered.
 *
 * The URL is member-supplied (a development client's owner sets their own), so
 * the Worker will POST a signed body to whatever it names. Cloudflare Workers
 * cannot reach private address space (`global_fetch_strictly_public`), which
 * is the real boundary; this refuses the obvious mistakes earlier, with a
 * message the owner can act on. The database holds the same `https` rule as a
 * CHECK constraint.
 */
export function endpointUrlProblem(value: string): string | null {
  if (value.length > 500) return "The URL is too long";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "That is not a URL";
  }
  if (url.protocol !== "https:") return "The URL must use https://";
  if (url.username || url.password) {
    return "The URL must not contain credentials";
  }
  if (url.port !== "") return "The URL must use the default https port";
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "The URL must be a public host. For a local stack, use `devtools moderation send`";
  }
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) {
    return "The URL must use a hostname, not an IP address";
  }
  if (!host.includes(".")) return "The URL must be a fully qualified hostname";
  return null;
}
