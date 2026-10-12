// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleQueue } from "./queue";

const ENV = {
  CRON_SECRET: "s".repeat(32),
  BASE_URL: "https://staging.devdogsuga.org",
};
const ID = "66666666-6666-4666-8666-666666666666";

function message(body: unknown, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn((input: string, init: RequestInit) =>
    Promise.resolve(handler(input, init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("the moderation queue consumer", () => {
  it("asks the Worker to attempt the delivery with the cron secret, then acks", async () => {
    const fetchMock = stubFetch(() => Response.json({ ack: true }));
    const m = message({ deliveryId: ID });
    await handleQueue(
      { queue: "staging-moderation-deliveries", messages: [m] },
      ENV,
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://staging.devdogsuga.org/cron/moderation-deliveries/deliver",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ENV.CRON_SECRET}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({ deliveryId: ID });
    expect(m.ack).toHaveBeenCalled();
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("retries with the route's delay when the delivery did not land", async () => {
    stubFetch(() => Response.json({ ack: false, retryAfterSeconds: 120 }));
    const m = message({ deliveryId: ID });
    await handleQueue(
      { queue: "staging-moderation-deliveries", messages: [m] },
      ENV,
    );
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(m.ack).not.toHaveBeenCalled();
  });

  it("retries rather than drops when the route fails or cannot be reached", async () => {
    stubFetch(() => new Response("boom", { status: 500 }));
    const failing = message({ deliveryId: ID }, 3);
    await handleQueue(
      { queue: "staging-moderation-deliveries", messages: [failing] },
      ENV,
    );
    expect(failing.retry).toHaveBeenCalledWith({ delaySeconds: 120 });

    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const unreachable = message({ deliveryId: ID });
    await handleQueue(
      { queue: "staging-moderation-deliveries", messages: [unreachable] },
      ENV,
    );
    expect(unreachable.retry).toHaveBeenCalled();
    expect(unreachable.ack).not.toHaveBeenCalled();
  });

  it("sends a dead-lettered message to the dead-letter route and always acks it", async () => {
    const fetchMock = stubFetch(() => Response.json({ ack: true }));
    const m = message({ deliveryId: ID });
    await handleQueue(
      { queue: "staging-moderation-deliveries-dlq", messages: [m] },
      ENV,
    );
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://staging.devdogsuga.org/cron/moderation-deliveries/dead-letter",
    );
    expect(m.ack).toHaveBeenCalled();
  });

  it("acks a message this code never sends, instead of retrying it forever", async () => {
    const fetchMock = stubFetch(() => Response.json({ ack: true }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const m = message({ unexpected: true });
    await handleQueue(
      { queue: "staging-moderation-deliveries", messages: [m] },
      ENV,
    );
    expect(m.ack).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
