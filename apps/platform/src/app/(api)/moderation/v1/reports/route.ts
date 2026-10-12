import { handleFileReport } from "~/server/moderation/api";
import { databaseReportApi } from "~/server/moderation/store";

/**
 * POST /moderation/v1/reports
 *
 * How an app outside the platform database files a report. Served on
 * `api.devdogsuga.org/moderation/v1/*` (staging: `api-staging...`) and on the
 * platform's own host.
 *
 * The caller is the app's backend, not a member's browser: the request is signed
 * with the app's OAuth client secret (Standard Webhooks) and names the client in
 * `moderation-client-id`. Everything else, including what a signed report may
 * say and what it costs, is `~/server/moderation/api.ts`. Documented in
 * docs/platform/guides/moderation/external-apps.md.
 */
export async function POST(request: Request) {
  return handleFileReport(request, databaseReportApi());
}
