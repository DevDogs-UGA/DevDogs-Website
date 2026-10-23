"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import { CopyButton } from "~/ui/copy-field";
import type { OAuthClientSummary } from "~/server/loaders/console";
import { Table, TBody, Td, Th, THead, Tr } from "~/ui/table";

/**
 * The clients of one tier as a table (settings-oauth.html): name, client ID
 * with a copy button, redirect URIs and the edit button that opens the drawer.
 * The "Created" column the mockup draws is left out: neither the loader nor
 * the registration table carries a creation date.
 */
export default function OAuthClientTable({
  clients,
  tier,
  onEdit,
}: {
  clients: OAuthClientSummary[];
  tier: "development" | "production";
  onEdit: (clientId: string) => void;
}) {
  const production = tier === "production";
  return (
    <Table caption={production ? "Production clients" : "Development clients"}>
      <THead>
        <tr>
          <Th>Client</Th>
          <Th>Client ID</Th>
          <Th>{production ? "Callback" : "Redirect URIs"}</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </tr>
      </THead>
      <TBody>
        {clients.map((client) => (
          <Tr key={client.clientId}>
            <Td wrap>
              <div className="set-name">{client.label}</div>
              {client.ownerName && (
                <div className="small muted">Created by {client.ownerName}</div>
              )}
            </Td>
            <Td>
              <span className="set-cid">
                {client.clientId}
                <CopyButton
                  value={client.clientId}
                  label={`Copy client ID for ${client.label}`}
                />
              </span>
            </Td>
            <Td className={production ? "small mono" : undefined}>
              {production
                ? (client.redirectUris[0] ?? "None")
                : client.redirectUris.length}
            </Td>
            <Td style={{ textAlign: "right" }}>
              <button
                type="button"
                className="iconbtn"
                aria-label={`Edit ${client.label}`}
                onClick={() => onEdit(client.clientId)}
              >
                <PencilSimpleIcon aria-hidden />
              </button>
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
