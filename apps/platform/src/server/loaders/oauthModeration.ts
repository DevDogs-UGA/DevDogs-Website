import { desc, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import {
  moderationClients,
  moderationDeliveries,
  sandboxReports,
} from "~/server/db/schema";
import { getOAuthPageData } from "~/server/loaders/console";

export type SandboxReportRow = {
  id: string;
  contentType: string;
  contentRef: string;
  reason: string;
  createdAt: string;
};

export type TestDeliveryRow = {
  id: string;
  type: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type ClientModeration = {
  clientId: string;
  label: string;
  enabled: boolean;
  endpointUrl: string | null;
  /** An officer registered this client as a production app. */
  production: boolean;
  sandboxReports: SandboxReportRow[];
  testDeliveries: TestDeliveryRow[];
};

const PER_CLIENT = 10;

/**
 * Moderation state for each of the signed-in member's OAuth clients: whether
 * it is on, where decisions go, the sandbox reports its backend has filed and
 * the test actions sent to it. Reads only the caller's own clients, since the
 * ids come from `getOAuthPageData`.
 */
export const getOAuthModerationData = cache(
  async (): Promise<ClientModeration[]> => {
    const { clients } = await getOAuthPageData();
    if (clients.length === 0) return [];
    const ids = clients.map((client) => client.clientId);

    const [settings, reports, deliveries] = await Promise.all([
      db
        .select()
        .from(moderationClients)
        .where(inArray(moderationClients.clientId, ids)),
      db
        .select()
        .from(sandboxReports)
        .where(inArray(sandboxReports.clientId, ids))
        .orderBy(desc(sandboxReports.createdAt))
        .limit(PER_CLIENT * ids.length),
      db
        .select()
        .from(moderationDeliveries)
        .where(inArray(moderationDeliveries.clientId, ids))
        .orderBy(desc(moderationDeliveries.createdAt))
        .limit(PER_CLIENT * ids.length),
    ]);

    return clients.map((client) => {
      const setting = settings.find((s) => s.clientId === client.clientId);
      return {
        clientId: client.clientId,
        label: client.label,
        enabled: setting !== undefined,
        endpointUrl: setting?.endpointUrl ?? null,
        production: setting?.appId != null,
        sandboxReports: reports
          .filter((r) => r.clientId === client.clientId)
          .slice(0, PER_CLIENT)
          .map((r) => ({
            id: r.id,
            contentType: r.contentType,
            contentRef: r.contentRef,
            reason: r.reason,
            createdAt: r.createdAt.toISOString(),
          })),
        testDeliveries: deliveries
          .filter((d) => d.clientId === client.clientId && d.sandbox)
          .slice(0, PER_CLIENT)
          .map((d) => ({
            id: d.id,
            type: d.type,
            status: d.status,
            attempts: d.attempts,
            lastError: d.lastError,
            createdAt: d.createdAt.toISOString(),
          })),
      };
    });
  },
);
