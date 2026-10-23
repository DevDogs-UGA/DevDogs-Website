import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import OAuthProductionClientsField from "./OAuthProductionClientsField";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Rolling a secret answers with the client's id and its new secret, the same
// shape a create returns.
vi.mock("~/server/actions/oauth", () => ({
  default: vi.fn(async () => ({
    clientId: "existing",
    clientSecret: "s3cret",
  })),
}));

// The drawer's confirm flow is not under test; a stub that rolls the open
// client's secret through the shared dispatch stands in for it.
vi.mock("~/components/Settings/OAuthClientSheet", () => ({
  default: ({
    client,
    dispatch,
    onClose,
  }: {
    client: { clientId: string } | null;
    dispatch: (data: FormData) => void;
    onClose: () => void;
  }) =>
    client ? (
      <div>
        <form action={dispatch}>
          <input type="hidden" name="intent" value="reset-secret" />
          <input type="hidden" name="clientId" value={client.clientId} />
          <button type="submit">Regenerate secret</button>
        </form>
        <button type="button" onClick={onClose}>
          Close drawer
        </button>
      </div>
    ) : null,
}));

type Clients = ComponentProps<
  typeof OAuthProductionClientsField
>["productionClients"];

const CLIENTS = [
  { clientId: "existing", label: "DogDays", redirectUris: [] },
] as unknown as Clients;

afterEach(cleanup);

describe("OAuthProductionClientsField", () => {
  it("opens the create form after a secret was rolled, not the rolled client's drawer", async () => {
    const user = userEvent.setup();
    render(<OAuthProductionClientsField productionClients={CLIENTS} />);

    await user.click(screen.getByRole("button", { name: "Edit DogDays" }));
    await user.click(screen.getByRole("button", { name: "Regenerate secret" }));
    await user.click(screen.getByRole("button", { name: "Close drawer" }));
    expect(
      screen.queryByRole("button", { name: "Regenerate secret" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "New production client" }),
    );
    expect(
      await screen.findByRole("heading", { name: "New production client" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Regenerate secret" }),
    ).not.toBeInTheDocument();
  });
});
