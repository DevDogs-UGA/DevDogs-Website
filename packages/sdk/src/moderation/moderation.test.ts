import { describe, expect, it } from "vitest";
import {
  MODERATION_EVENT_TYPES,
  SAMPLE_EVENTS,
  SAMPLE_NOW,
  SAMPLE_SECRET,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WebhookVerificationError,
  createMemoryReceiverStore,
  createReferenceReceiver,
  generateSigningSecret,
  moderationEventSchema,
  moderationReportSchema,
  signMessage,
  signSample,
  signedHeaders,
  signedSamples,
  subjectOf,
  verifyMessage,
  type ModerationEvent,
} from "./index.js";

describe("signing", () => {
  it("matches the Standard Webhooks reference vector", async () => {
    // The vector from the Standard Webhooks specification: this secret, this
    // id, timestamp and payload sign to this value.
    const signature = await signMessage(
      "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      "msg_p5jXN8AQM9LWM0D4loKWxJek",
      1614265330,
      '{"test": 2432232314}',
    );
    expect(signature).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("verifies what it signs and returns the message id", async () => {
    const body = '{"a":1}';
    const headers = await signedHeaders(SAMPLE_SECRET, "msg_1", body, {
      now: SAMPLE_NOW,
    });
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, body, { now: SAMPLE_NOW }),
    ).resolves.toBe("msg_1");
  });

  it("accepts a Headers object and any header-name casing", async () => {
    const body = "{}";
    const signed = await signedHeaders(SAMPLE_SECRET, "msg_2", body, {
      now: SAMPLE_NOW,
    });
    const headers = new Headers(signed);
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, body, { now: SAMPLE_NOW }),
    ).resolves.toBe("msg_2");
    await expect(
      verifyMessage(
        SAMPLE_SECRET,
        {
          "Webhook-Id": signed[WEBHOOK_ID_HEADER],
          "Webhook-Timestamp": signed[WEBHOOK_TIMESTAMP_HEADER],
          "Webhook-Signature": signed[WEBHOOK_SIGNATURE_HEADER],
        },
        body,
        { now: SAMPLE_NOW },
      ),
    ).resolves.toBe("msg_2");
  });

  it("rejects a tampered body, a wrong secret and a missing header", async () => {
    const headers = await signedHeaders(SAMPLE_SECRET, "msg_3", "{}", {
      now: SAMPLE_NOW,
    });
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, '{"x":1}', { now: SAMPLE_NOW }),
    ).rejects.toMatchObject({ reason: "no-valid-signature" });
    await expect(
      verifyMessage(generateSigningSecret(), headers, "{}", { now: SAMPLE_NOW }),
    ).rejects.toMatchObject({ reason: "no-valid-signature" });
    await expect(
      verifyMessage(
        SAMPLE_SECRET,
        { [WEBHOOK_ID_HEADER]: "msg_3" },
        "{}",
        { now: SAMPLE_NOW },
      ),
    ).rejects.toMatchObject({ reason: "missing-headers" });
  });

  it("rejects messages more than five minutes old or new", async () => {
    const headers = await signedHeaders(SAMPLE_SECRET, "msg_4", "{}", {
      now: SAMPLE_NOW,
    });
    const inside = new Date(SAMPLE_NOW.getTime() + 4 * 60 * 1000);
    const late = new Date(SAMPLE_NOW.getTime() + 6 * 60 * 1000);
    const early = new Date(SAMPLE_NOW.getTime() - 6 * 60 * 1000);
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, "{}", { now: inside }),
    ).resolves.toBe("msg_4");
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, "{}", { now: late }),
    ).rejects.toMatchObject({ reason: "timestamp-too-old" });
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, "{}", { now: early }),
    ).rejects.toMatchObject({ reason: "timestamp-too-new" });
  });

  it("accepts any one of several space-delimited signatures", async () => {
    const body = "{}";
    const signed = await signedHeaders(SAMPLE_SECRET, "msg_5", body, {
      now: SAMPLE_NOW,
    });
    const headers = {
      ...signed,
      [WEBHOOK_SIGNATURE_HEADER]: `v1,AAAA v2,ignored ${signed[WEBHOOK_SIGNATURE_HEADER]}`,
    };
    await expect(
      verifyMessage(SAMPLE_SECRET, headers, body, { now: SAMPLE_NOW }),
    ).resolves.toBe("msg_5");
  });

  it("generates secrets in the whsec_ form", () => {
    expect(generateSigningSecret()).toMatch(/^whsec_[A-Za-z0-9+/]{32}$/);
    expect(new WebhookVerificationError("bad-timestamp", "x").name).toBe(
      "WebhookVerificationError",
    );
  });
});

describe("messages", () => {
  it("parses every sample", () => {
    for (const event of Object.values(SAMPLE_EVENTS)) {
      expect(moderationEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("covers every event type with a sample", () => {
    const sampled = new Set(Object.values(SAMPLE_EVENTS).map((e) => e.type));
    for (const type of MODERATION_EVENT_TYPES) expect(sampled).toContain(type);
  });

  it("refuses an unknown type and a malformed owner", () => {
    expect(
      moderationEventSchema.safeParse({ ...SAMPLE_EVENTS.hide, type: "nope" })
        .success,
    ).toBe(false);
    expect(
      moderationEventSchema.safeParse({
        ...SAMPLE_EVENTS.hide,
        data: { ...SAMPLE_EVENTS.hide.data, ownerId: "not-a-uuid" },
      }).success,
    ).toBe(false);
  });

  it("keys ordering by subject", () => {
    expect(subjectOf(SAMPLE_EVENTS.hide)).toBe("content:session:session-1");
    expect(subjectOf(SAMPLE_EVENTS.restore)).toBe("content:session:session-1");
    expect(subjectOf(SAMPLE_EVENTS.suspend)).toBe(
      `user:${SAMPLE_EVENTS.unsuspend.data.userId}`,
    );
    expect(subjectOf(SAMPLE_EVENTS.ping)).toBeNull();
  });

  it("validates a report", () => {
    const report = {
      contentType: "session",
      contentId: "s1",
      ownerId: "11111111-1111-4111-8111-111111111111",
      reporterId: "22222222-2222-4222-8222-222222222222",
      reason: "spam",
      snapshot: { title: "Study group" },
    };
    expect(moderationReportSchema.safeParse(report).success).toBe(true);
    expect(
      moderationReportSchema.safeParse({ ...report, reason: "boring" }).success,
    ).toBe(false);
    expect(
      moderationReportSchema.safeParse({ ...report, details: "x".repeat(1001) })
        .success,
    ).toBe(false);
  });
});

describe("the reference receiver", () => {
  const options = { now: SAMPLE_NOW };

  function setup() {
    const store = createMemoryReceiverStore();
    const applied: ModerationEvent[] = [];
    const receiver = createReferenceReceiver({
      secret: SAMPLE_SECRET,
      store,
      apply: (event) => void applied.push(event),
      verify: options,
    });
    return { store, applied, receiver };
  }

  it("applies a signed event once and ignores its replay", async () => {
    const { receiver, applied } = setup();
    const hide = await signSample("hide");

    const first = await receiver.handle(hide.headers, hide.body);
    expect(first).toMatchObject({ httpStatus: 200, outcome: { status: "applied" } });

    const replay = await receiver.handle(hide.headers, hide.body);
    expect(replay).toMatchObject({
      httpStatus: 200,
      outcome: { status: "duplicate", id: "msg_sample_hide" },
    });
    expect(applied).toHaveLength(1);
  });

  it("ignores an event decided before the last one applied to the same subject", async () => {
    const { receiver, applied } = setup();
    const hide = await signSample("hide");
    const older = await signSample("restoreOlder");

    await receiver.handle(hide.headers, hide.body);
    const late = await receiver.handle(older.headers, older.body);
    expect(late).toMatchObject({ httpStatus: 200, outcome: { status: "stale" } });
    expect(applied.map((e) => e.id)).toEqual(["msg_sample_hide"]);

    // A genuinely newer decision on the same subject still applies.
    const newer = await signSample("restore");
    expect(await receiver.handle(newer.headers, newer.body)).toMatchObject({
      outcome: { status: "applied" },
    });
  });

  it("acknowledges a ping without applying it", async () => {
    const { receiver, applied } = setup();
    const ping = await signSample("ping");
    expect(await receiver.handle(ping.headers, ping.body)).toMatchObject({
      httpStatus: 200,
      outcome: { status: "pinged" },
    });
    expect(applied).toHaveLength(0);
  });

  it("answers 401 to a bad signature and 400 to a signed body that is not an event", async () => {
    const { receiver, applied } = setup();
    const hide = await signSample("hide");
    expect(
      await receiver.handle(hide.headers, `${hide.body} `),
    ).toMatchObject({ httpStatus: 401 });

    const body = '{"not":"an event"}';
    const headers = await signedHeaders(SAMPLE_SECRET, "msg_x", body, options);
    expect(await receiver.handle(headers, body)).toMatchObject({
      httpStatus: 400,
      outcome: { status: "malformed" },
    });
    const text = "not json";
    const textHeaders = await signedHeaders(SAMPLE_SECRET, "msg_y", text, options);
    expect(await receiver.handle(textHeaders, text)).toMatchObject({
      httpStatus: 400,
    });
    expect(applied).toHaveLength(0);
  });

  it("round-trips every sample through the receiver", async () => {
    const { receiver, store } = setup();
    for (const sample of await signedSamples()) {
      const result = await receiver.handle(sample.headers, sample.body);
      expect(result.httpStatus).toBe(200);
    }
    expect(store.messages.size).toBe(Object.keys(SAMPLE_EVENTS).length);
  });
});
