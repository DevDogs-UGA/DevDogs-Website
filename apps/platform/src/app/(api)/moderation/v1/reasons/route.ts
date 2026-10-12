import { connection } from "next/server";
import { listReportReasons } from "~/server/moderation/store";

/**
 * GET /moderation/v1/reasons
 *
 * The report reasons an app can offer, in display order. Public: it is a fixed
 * list, and an app's report dialog needs it before it has anything to sign.
 */
export async function GET() {
  await connection();
  return Response.json(
    { reasons: await listReportReasons() },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
