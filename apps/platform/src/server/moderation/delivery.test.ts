// @vitest-environment node
import {
  SAMPLE_CONTENT,
  buildMessage,
  createMemoryStore,
  createReceiver,
  generateSecret,
  verifyMessage,
} from "@devdogsuga/sdk/moderation";
import { describe, expect, it, vi } from "vitest";
import {
  attemptDelivery,
  deliveryMessageId,
  type DeliveryStore,
  type DeliveryTarget,
} from "./delivery";
import { retryDelaySeconds } from "./queueMessage";
import { deriveClientSecret } from "./secrets";

const KEY = "unit-test-moderation-signing-key-0123456789";
const CLIENT = "11111111-1111-4111-8111-111111111111";
const DELIVERY = "66666666-6666-4666-8666-666666666666";

function target(overrides: Partial<DeliveryTarget> = {}): DeliveryTarget {
  return {
    id: DELIVERY,
    status: "pending",
    attempts: 0,
    payload: buildMessage({ type: "content.hide" }),
    clientId: CLIENT,
    endpointUrl: "https://app.example.com/functions/v1/platform-moderation",
    secretVersion: 1,
    ...overrides,
  };
}

function fakeStore(row: DeliveryTarget | null) {
  const calls: string[] = [];
  const store: DeliveryStore = {
    load: () => Promise.resolve(row),
    markDelivered: () => {
      calls.push("delivered");
      return Promise.resolve();
    },
    markAttemptFailed: (_id, error) => {
      calls.push(`attempt-failed:${error}`);
      return Promise.resolve();
    },
    markFailed: (_id, error) => {
      calls.push(`failed:${error}`);
      return Promise.resolve();
    },
  };
  return { store, calls };
}

describe("attemptDelivery", () => {
  it("signs the frozen payload with the client's secret and marks it delivered on a 2xx", async () => {
    const row = target();
    const { store, calls } = fakeStore(row);
    let seen: { url: string; headers: Headers; body: string } | undefined;
    const outcome = await attemptDelivery(DELIVERY, {
      store,
      signingKey: KEY,
      fetch: (input, init) => {
        seen = {
          url: input as string,
          headers: new Headers(init?.headers),
          body: init?.body as string,
        };
        return Promise.resolve(new Response("ok", { status: 200 }));
      },
    });

    expect(outcome).toEqual({ ack: true, result: "delivered" });
    expect(calls).toEqual(["delivered"]);
    expect(seen?.url).toBe(
      "https://app.example.com/functions/v1/platform-moderation",
    );
    expect(seen?.headers.get("webhook-id")).toBe(deliveryMessageId(DELIVERY));
    const secret = await deriveClientSecret(KEY, CLIENT, 1);
    expect((await verifyMessage(secret, seen!.headers, seen!.body)).ok).toBe(
      true,
    );
    expect(JSON.parse(seen!.body)).toEqual(row.payload);
  });

  it("round-trips into the reference receiver: applied once, a resend ignored", async () => {
    const secret = await deriveClientSecret(KEY, CLIENT, 1);
    const store = createMemoryStore();
    const receiver = createReceiver({ secret, store });
    const { store: deliveryStore } = fakeStore(target());

    const send = () =>
      attemptDelivery(DELIVERY, {
        store: deliveryStore,
        signingKey: KEY,
        fetch: async (_input, init) => {
          const result = await receiver.handle(
            new Headers(init?.headers),
            init?.body as string,
          );
          return Response.json(result, { status: result.status });
        },
      });

    expect(await send()).toEqual({ ack: true, result: "delivered" });
    expect(await send()).toEqual({ ack: true, result: "delivered" });
    expect(store.applied).toHaveLength(1);
    expect(
      store.content.get(
        `${SAMPLE_CONTENT.contentType}:${SAMPLE_CONTENT.contentRef}`,
      ),
    ).toBe("hidden");
  });

  it("keeps it pending and backs off when the endpoint refuses", async () => {
    const { store, calls } = fakeStore(target({ attempts: 2 }));
    const outcome = await attemptDelivery(DELIVERY, {
      store,
      signingKey: KEY,
      fetch: () => Promise.resolve(new Response("nope", { status: 401 })),
    });
    expect(outcome).toEqual({
      ack: false,
      retryAfterSeconds: retryDelaySeconds(3),
      error: "HTTP 401: nope",
    });
    expect(calls).toEqual(["attempt-failed:HTTP 401: nope"]);
  });

  it("retries a network failure and a redirect rather than following it", async () => {
    const { store } = fakeStore(target());
    const down = await attemptDelivery(DELIVERY, {
      store,
      signingKey: KEY,
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    expect(down).toMatchObject({ ack: false });

    const redirect = await attemptDelivery(DELIVERY, {
      store,
      signingKey: KEY,
      fetch: () =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: "https://elsewhere.example" },
          }),
        ),
    });
    expect(redirect).toMatchObject({ ack: false, error: "HTTP 302" });
  });

  it("does not revive a delivery that is delivered, failed or gone", async () => {
    for (const row of [
      null,
      target({ status: "delivered" }),
      target({ status: "failed" }),
    ]) {
      const fetchSpy = vi.fn();
      const { store, calls } = fakeStore(row);
      expect(
        await attemptDelivery(DELIVERY, {
          store,
          signingKey: KEY,
          fetch: fetchSpy,
        }),
      ).toEqual({ ack: true, result: "skipped" });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    }
  });

  it("parks a delivery for a person when there is nowhere to send it", async () => {
    for (const row of [
      target({ clientId: null, endpointUrl: null, secretVersion: null }),
      target({ endpointUrl: null }),
      target({ endpointUrl: "http://app.example.com/hook" }),
      target({ endpointUrl: "https://10.0.0.5/hook" }),
    ]) {
      const fetchSpy = vi.fn();
      const { store, calls } = fakeStore(row);
      expect(
        await attemptDelivery(DELIVERY, {
          store,
          signingKey: KEY,
          fetch: fetchSpy,
        }),
      ).toEqual({ ack: true, result: "failed" });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(calls[0]).toMatch(/^failed:/);
    }
  });

  it("keeps retrying while the platform has no signing key", async () => {
    const { store, calls } = fakeStore(target());
    const outcome = await attemptDelivery(DELIVERY, {
      store,
      signingKey: undefined,
      fetch: vi.fn(),
    });
    expect(outcome).toMatchObject({ ack: false });
    expect(calls[0]).toMatch(/^attempt-failed:MODERATION_SIGNING_KEY/);
  });

  it("uses the rotated secret after a version bump", async () => {
    const { store } = fakeStore(target({ secretVersion: 2 }));
    let headers: Headers | undefined;
    let body = "";
    await attemptDelivery(DELIVERY, {
      store,
      signingKey: KEY,
      fetch: (_input, init) => {
        headers = new Headers(init?.headers);
        body = init?.body as string;
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    });
    const v1 = await deriveClientSecret(KEY, CLIENT, 1);
    const v2 = await deriveClientSecret(KEY, CLIENT, 2);
    expect(v1).not.toBe(v2);
    expect((await verifyMessage(v1, headers!, body)).ok).toBe(false);
    expect((await verifyMessage(v2, headers!, body)).ok).toBe(true);
    // And a secret an app generated itself can never verify a delivery.
    expect((await verifyMessage(generateSecret(), headers!, body)).ok).toBe(
      false,
    );
  });
});

describe("retryDelaySeconds", () => {
  it("doubles from 30 seconds and stops at an hour", () => {
    expect([1, 2, 3, 4].map(retryDelaySeconds)).toEqual([30, 60, 120, 240]);
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(20)).toBe(3600);
  });
});
