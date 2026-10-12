export function isSuccessfulRemovalStatus(status: number): boolean {
  return (status >= 200 && status < 300) || status === 404;
}

/**
 * Fits a preferred name to Discord's 1-32 character nickname limit, counted
 * in code points so a trailing emoji is dropped whole rather than split.
 * @returns `undefined` when nothing usable is left, so no nickname is sent.
 */
export function guildNickname(preferredName: string): string | undefined {
  const nick = Array.from(preferredName.trim()).slice(0, 32).join("").trim();
  return nick || undefined;
}

export function withConnectedAccountStatus(
  callbackPath: string,
  level: "error" | "warning",
  code: string,
  provider: string,
): string {
  const destination = new URL(callbackPath, "https://devdogsuga.invalid");
  destination.searchParams.set("connectedAccountStatus", level);
  destination.searchParams.set("connectedAccountCode", code);
  destination.searchParams.set("connectedAccountProvider", provider);
  return destination.pathname + destination.search + destination.hash;
}
