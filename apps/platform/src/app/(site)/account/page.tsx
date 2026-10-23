import { permanentRedirect } from "next/navigation";

/**
 * `/account` became `/settings/profile`. Kept as a permanent redirect rather
 * than a page: old links, the profile menu's history and every
 * `authenticate("google", "/account")` callback still land somewhere. The query
 * string rides along because the connect-account round trips report their
 * result there.
 */
export default async function AccountRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, v);
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  // The result of linking an account is shown on the accounts page.
  const target = query.has("connectedAccountStatus")
    ? "/settings/accounts"
    : "/settings/profile";
  permanentRedirect(`${target}${suffix}`);
}
