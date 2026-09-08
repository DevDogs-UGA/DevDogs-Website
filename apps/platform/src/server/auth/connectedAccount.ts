export function isSuccessfulRemovalStatus(status: number): boolean {
  return (status >= 200 && status < 300) || status === 404;
}

export async function isSuccessfulGitHubInvitation(
  response: Response,
): Promise<boolean> {
  if (response.ok) return true;
  if (response.status !== 422) return false;

  const detail = (await response.clone().text()).toLowerCase();
  return (
    detail.includes("already exists") ||
    detail.includes("already a part") ||
    detail.includes("already invited")
  );
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
